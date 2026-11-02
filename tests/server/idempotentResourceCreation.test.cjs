const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { randomUUID } = require('node:crypto')
const mongoose = require('mongoose')
const { createLoader } = require('./loadWithAliases.cjs')

test('idempotent proposals/templates: standalone Mongo, retry, concurrent insert, deletion race, tenant and user isolation', {
  skip: !process.env.AI_EDIT_TEST_MONGOD, timeout: 90000,
}, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedelo-create-'))
  const probe = net.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const child = spawn(process.env.AI_EDIT_TEST_MONGOD, ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet'], { stdio: 'ignore', windowsHide: true })
  const exited = once(child, 'exit')
  try {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/resource_create_test`, { serverSelectionTimeoutMS: 30000 })
    const { load } = await createLoader({ 'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } } })
    const { prepareResourceCreation, deleteCreatedResource, requireCreationRequest } = load('server/idempotentResourceCreation.js')
    const Proposals = load('models/Proposals.js').default, Templates = load('models/ProposalTemplates.js').default
    const tenantId = new mongoose.Types.ObjectId(), other = new mongoose.Types.ObjectId(), eventId = new mongoose.Types.ObjectId()
    const context = { tenantId, user: { _id: tenantId } }
    for (const [model, kind, draft] of [[Proposals, 'proposal', { tenantId, eventId, title: 'Первое КП', clientSnapshot: { firstName: 'Private' }, publicTokenHash: 'private-token' }], [Templates, 'proposal-template', { tenantId, name: 'Первый шаблон', messageTemplate: 'Private contents' }]]) {
      const requestId = randomUUID(), input = { model, kind, context, scope: { eventId: String(eventId) }, body: { requestId, title: 'Confirmed input' } }
      const [a, b] = await Promise.all([prepareResourceCreation(input), prepareResourceCreation(input)])
      const [first, repeated] = await Promise.all([a.create(draft), b.create(draft)])
      assert.equal(String(first._id), String(repeated._id))
      assert.equal(first.creationRequest, undefined)
      assert.equal(await model.countDocuments({ tenantId }), 1)
      assert.deepEqual(await a.cancel(), { state: 'created', id: String(first._id) })
      assert.equal(await model.countDocuments({ tenantId }), 1)
      // A lost response after another device edited the resource reads current data.
      const patch = kind === 'proposal' ? { title: 'Поздняя правка PWA' } : { name: 'Поздняя правка PWA' }
      await model.updateOne({ _id: first._id, tenantId }, { $set: patch })
      const recovered = await prepareResourceCreation(input)
      assert.equal(recovered.existing[kind === 'proposal' ? 'title' : 'name'], 'Поздняя правка PWA')
      await assert.rejects(() => prepareResourceCreation({ ...input, body: { requestId, title: 'Changed' } }), error => error.status === 409)
      await assert.rejects(() => prepareResourceCreation({ ...input, scope: { eventId: String(other) } }), error => error.status === 409)
      assert.equal(await deleteCreatedResource(model, { _id: first._id, tenantId: other }), null)
      // The same UUID never addresses another tenant/user's resource.
      const foreign = await prepareResourceCreation({ ...input, context: { tenantId: other, user: { _id: other } } })
      assert.equal(foreign.existing, null)
      const foreignItem = await foreign.create({ ...draft, tenantId: other })
      assert.notEqual(String(foreignItem._id), String(first._id))
      const colleague = await prepareResourceCreation({ ...input, context: { tenantId, user: { _id: other } } })
      assert.equal(colleague.existing, null)
      // A creator captured before deletion must not recreate the resource after it.
      const captured = await prepareResourceCreation(input)
      const staleDocument = await model.findOne({ _id: first._id, tenantId })
      assert.ok(await deleteCreatedResource(model, { _id: first._id, tenantId }))
      assert.equal(await model.findOne({ _id: first._id, tenantId }).lean(), null)
      assert.equal(await model.exists({ _id: first._id, tenantId }), null)
      assert.equal(await model.countDocuments({ tenantId }), 0)
      assert.equal((await model.updateOne({ _id: first._id, tenantId }, { $set: patch })).matchedCount, 0)
      await assert.rejects(() => captured.create(draft), error => error.status === 410)
      await assert.rejects(() => prepareResourceCreation(input), error => error.status === 410)
      if (kind === 'proposal') staleDocument.title = 'Late document save'
      else staleDocument.name = 'Late document save'
      await assert.rejects(() => staleDocument.save())
      const tombstone = await model.collection.findOne({ _id: first._id })
      assert.deepEqual(Object.keys(tombstone).sort(), ['_id', 'creationDeletedAt', 'creationRequest', 'tenantId'])
      assert.equal(await model.collection.countDocuments({ _id: first._id }), 1)
      // Legacy resources retain physical deletion and ordinary creation behavior.
      const legacy = await prepareResourceCreation({ ...input, body: {} })
      const old = await legacy.create(draft)
      await deleteCreatedResource(model, { _id: old._id, tenantId })
      assert.equal(await model.collection.findOne({ _id: old._id }), null)
      const cancelledInput = { ...input, body: { ...input.body, requestId: randomUUID() } }
      const lateCreator = await prepareResourceCreation(cancelledInput)
      const cancellation = await prepareResourceCreation(cancelledInput)
      assert.deepEqual(await cancellation.cancel(), { state: 'cancelled' })
      await assert.rejects(() => lateCreator.create(draft), error => error.code === 'creation_cancelled')
      await assert.rejects(() => prepareResourceCreation(cancelledInput), error => error.code === 'creation_cancelled')
      assert.equal(await model.countDocuments({ tenantId }), 0)
      const cancelledMarker = await model.collection.findOne({ tenantId, 'creationRequest.requestId': cancelledInput.body.requestId })
      assert.deepEqual(Object.keys(cancelledMarker).sort(), ['_id', 'creationDeletedAt', 'creationRequest', 'tenantId'])
      assert.equal(cancelledMarker.creationRequest.cancelled, true)
      // Neither race ordering can delete an already created resource or let a
      // cancelled attempt insert content after acknowledgement.
      const racedInput = { ...input, body: { ...input.body, requestId: randomUUID() } }
      const creator = await prepareResourceCreation(racedInput), canceller = await prepareResourceCreation(racedInput)
      const [write, cancel] = await Promise.allSettled([creator.create(draft), canceller.cancel()])
      if (write.status === 'fulfilled') {
        assert.equal(cancel.status, 'fulfilled')
        assert.deepEqual(cancel.value, { state: 'created', id: String(write.value._id) })
        assert.ok(await model.findOne({ _id: write.value._id, tenantId }))
      } else {
        assert.equal(write.reason.code, 'creation_cancelled')
        assert.equal(cancel.status, 'fulfilled')
        assert.deepEqual(cancel.value, { state: 'cancelled' })
      }
    }
    let calls = 0
    const wrapper = requireCreationRequest(async request => { calls++; assert.equal(request.headers.get('authorization'), 'Bearer fixture'); return Response.json(await request.json()) })
    for (const body of [{}, [], { requestId: 'invalid' }]) {
      assert.equal((await wrapper(new Request('http://test/create', { method: 'POST', body: JSON.stringify(body) }))).status, 400)
    }
    assert.equal(calls, 0)
    const requestId = randomUUID()
    const good = await wrapper(new Request('http://test/create', { method: 'POST', headers: { authorization: 'Bearer fixture' }, body: JSON.stringify({ requestId }) }))
    assert.equal((await good.json()).requestId, requestId)
    assert.equal(calls, 1)
  } finally {
    await mongoose.disconnect()
    child.kill(); await exited.catch(() => {})
    // The task-created directory is under the OS temp directory, with a fixed prefix.
    const target = path.resolve(dir), root = path.resolve(os.tmpdir()) + path.sep
    if (!target.startsWith(root) || !path.basename(target).startsWith('vedelo-create-')) throw new Error('Unexpected test directory')
    fs.rmSync(target, { recursive: true, force: true })
  }
})
