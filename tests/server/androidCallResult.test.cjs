const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net')
const { spawn } = require('node:child_process'), { once } = require('node:events'), { randomUUID } = require('node:crypto')
const mongoose = require('mongoose')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const compile = (filename, mocks) => {
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } })
  const compiledModule = { exports: {} }; new Function('require', 'module', 'exports', code)(id => { assert.ok(id in mocks, id); return mocks[id] }, compiledModule, compiledModule.exports); return compiledModule.exports
}
test('Android manual result: real Mongo replay, partial failure, foreign IDs and unknown duration', { skip: !process.env.ANDROID_CALL_TEST_MONGOD, timeout: 90000 }, async t => {
  await loadBindings()
  const { saveAndroidCallResult, serializeAndroidCallResult } = await import('../../server/androidCallResult.mjs')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedelo-android-call-'))
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve))
  const child = spawn(process.env.ANDROID_CALL_TEST_MONGOD, ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet'], { stdio: 'ignore', windowsHide: true })
  const exited = once(child, 'exit')
  try {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/android_call_test`, { serverSelectionTimeoutMS: 30000 })
    const schema = compile('schemas/callsSchema.js', { mongoose }).default
    const Calls = compile('models/Calls.js', { mongoose, '@schemas/callsSchema': schema }).default
    await Calls.init()
    const O = mongoose.Schema.Types.ObjectId
    const Clients = mongoose.model('AndroidClientsTest', new mongoose.Schema({ tenantId: O }))
    const Events = mongoose.model('AndroidEventsTest', new mongoose.Schema({ tenantId: O, status: String, syncVersion: { type: Number, default: 1 }, additionalEvents: [{ title: String, description: String, date: Date, done: Boolean, doneAt: Date, googleCalendarEventId: String, googleSyncMode: String, googleDurationMinutes: Number }] }))
    const tenantId = String(new mongoose.Types.ObjectId()), otherTenant = String(new mongoose.Types.ObjectId())
    const own = await Clients.create({ tenantId }), foreign = await Clients.create({ tenantId: otherTenant })
    const event = await Events.create({ tenantId, status: 'draft' })
    const body = { requestId: randomUUID(), phone: '+7 999 123-45-67', direction: 'incoming', result: 'follow_up', note: 'Договорились созвониться', clientId: String(own._id), eventId: String(event._id), nextContactAt: '2026-12-01T10:00:00.000Z', nextContactTitle: 'Перезвонить' }
    const save = (payload, extra = {}) => saveAndroidCallResult({ Calls, Clients, Events, tenantId, userId: tenantId, body: payload, ...extra })
    await t.test('parallel submissions and lost-response retry save one call and one task', async () => {
      const results = await Promise.all([save(body), save(body), save(body)])
      assert.equal(new Set(results.map(result => String(result.call._id))).size, 1)
      assert.equal(await Calls.countDocuments({ tenantId }), 1)
      const fresh = await Events.findById(event._id).lean()
      assert.equal(fresh.additionalEvents.length, 1); assert.equal(fresh.syncVersion, 2)
      assert.equal(results[0].call.durationSec, null)
      assert.equal(serializeAndroidCallResult(results[0].call).durationSec, null)
      assert.equal((await save(body)).replay, true)
    })
    await t.test('different payload cannot reuse a request; foreign links and missing auth cannot write', async () => {
      await assert.rejects(save({ ...body, note: 'Другое' }), { status: 409 })
      await assert.rejects(save({ ...body, requestId: randomUUID(), clientId: String(foreign._id) }), { status: 404 })
      await assert.rejects(save({ ...body, requestId: randomUUID() }, { tenantId: otherTenant, userId: otherTenant }), { status: 404 })
      await assert.rejects(save(body, { tenantId: '' }), { status: 401 })
      await assert.rejects(save({ ...body, durationSec: 0 }), { status: 400 })
      await assert.rejects(save({ ...body, tenantId: otherTenant }), { status: 400 })
      assert.equal(await Calls.countDocuments({ tenantId: otherTenant }), 0)
    })
    await t.test('recovery after task write failure does not duplicate the saved result', async () => {
      const payload = { ...body, requestId: randomUUID() }
      await assert.rejects(save(payload, { Events: { findOne: Events.findOne.bind(Events), updateOne: async () => { throw Error('interrupted') } } }))
      assert.equal(await Calls.countDocuments({ providerCallId: payload.requestId }), 1)
      assert.equal((await save(payload)).call.androidResultOperation.state, 'confirmed')
      assert.equal((await Events.findById(event._id)).additionalEvents.length, 2)
      await save(payload)
      assert.equal((await Events.findById(event._id)).additionalEvents.length, 2)
    })
    await t.test('a task saved before closing the order can still confirm after a lost response', async () => {
      const payload = { ...body, requestId: randomUUID() }
      await assert.rejects(save(payload, { Calls: {
        findOne: Calls.findOne.bind(Calls), create: Calls.create.bind(Calls),
        findOneAndUpdate: () => ({ lean: async () => { throw Error('interrupted after task') } }),
      } }))
      await Events.updateOne({ _id: event._id, tenantId }, { $set: { status: 'closed' } })
      const count = (await Events.findById(event._id)).additionalEvents.length
      assert.equal((await save(payload)).call.androidResultOperation.state, 'confirmed')
      assert.equal((await Events.findById(event._id)).additionalEvents.length, count)
    })
  } finally {
    await mongoose.disconnect(); child.kill(); await exited.catch(() => {}); fs.rmSync(dir, { recursive: true, force: true })
  }
})
