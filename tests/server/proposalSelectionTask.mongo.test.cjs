const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  net = require('node:net')
const { spawn } = require('node:child_process'),
  { once } = require('node:events'),
  mongoose = require('mongoose')
const { createLoader } = require('./loadWithAliases.cjs')
test(
  'selection task: real Mongo preserves legacy tasks, retries, tenant and calendar fields',
  { skip: !process.env.PROPOSAL_TEST_MONGOD, timeout: 60000 },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedelo-proposal-task-'))
    const probe = net.createServer()
    await new Promise((r) => probe.listen(0, '127.0.0.1', r))
    const port = probe.address().port
    await new Promise((r) => probe.close(r))
    const child = spawn(
      process.env.PROPOSAL_TEST_MONGOD,
      [
        '--dbpath',
        dir,
        '--bind_ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--quiet',
      ],
      { stdio: 'ignore', windowsHide: true }
    )
    const exited = once(child, 'exit')
    try {
      await mongoose.connect(`mongodb://127.0.0.1:${port}/proposal_task_test`, {
        serverSelectionTimeoutMS: 30000,
      })
      const { load } = await createLoader()
      const E = load('models/Events.js').default,
        P = load('models/Proposals.js').default
      const { syncProposalSelectionTask: sync } = load(
        'server/proposalSelectionTask.js'
      )
      const tenantId = new mongoose.Types.ObjectId(),
        other = new mongoose.Types.ObjectId(),
        eventId = new mongoose.Types.ObjectId(),
        proposalId = new mongoose.Types.ObjectId(),
        taskId = new mongoose.Types.ObjectId()
      const task = {
        _id: taskId,
        title: 'Связаться с клиентом: выбран вариант «Интерактив»',
        description: 'Клиент выбрал коммерческое предложение версии 1.',
        date: new Date('2026-10-26T10:00Z'),
        done: false,
        googleCalendarEventId: 'calendar-keep',
      }
      // Raw insertion reproduces old documents without newer subdocument defaults.
      await E.collection.insertOne({
        _id: eventId,
        tenantId,
        status: 'draft',
        additionalEvents: [task],
        syncVersion: 2,
      })
      await P.collection.insertOne({
        _id: proposalId,
        tenantId,
        eventId,
        title: 'КП',
        version: 1,
        selectedPackageId: '',
        selectionTaskCreatedAt: new Date(),
        packages: [{ id: 'one', title: 'Интерактив' }],
      })
      const args = { proposalId, tenantId }
      await sync(args)
      let event = await E.findById(eventId).lean()
      assert.equal(event.additionalEvents.length, 1)
      assert.match(event.additionalEvents[0].title, /отменён/)
      assert.equal(String(event.additionalEvents[0]._id), String(taskId))
      assert.equal(
        event.additionalEvents[0].googleCalendarEventId,
        'calendar-keep'
      )
      assert.deepEqual(event.additionalEvents[0].date, task.date)
      assert.equal(event.syncVersion, 3)
      await sync(args)
      assert.equal((await E.findById(eventId).lean()).syncVersion, 3)
      assert.equal(
        String((await P.findById(proposalId).lean()).selectionTaskId),
        String(taskId)
      )
      await P.updateOne(
        { _id: proposalId, tenantId },
        { $set: { selectedPackageId: 'one' } }
      )
      await sync(args)
      event = await E.findById(eventId).lean()
      assert.match(event.additionalEvents[0].title, /Интерактив/)
      assert.equal(event.additionalEvents.length, 1)
      const before = JSON.stringify(event)
      await sync({ proposalId, tenantId: other })
      assert.equal(JSON.stringify(await E.findById(eventId).lean()), before)
      await E.updateOne(
        { _id: eventId, tenantId },
        { $set: { 'additionalEvents.0.done': true } }
      )
      await P.updateOne(
        { _id: proposalId, tenantId },
        { $set: { selectedPackageId: '' } }
      )
      await sync(args)
      assert.match(
        (await E.findById(eventId).lean()).additionalEvents[0].title,
        /Интерактив/
      )
      const newEvent = new mongoose.Types.ObjectId(),
        newProposal = new mongoose.Types.ObjectId()
      await E.collection.insertOne({
        _id: newEvent,
        tenantId,
        status: 'draft',
        additionalEvents: [],
        syncVersion: 1,
      })
      await P.collection.insertOne({
        _id: newProposal,
        tenantId,
        eventId: newEvent,
        title: 'КП',
        version: 2,
        selectedPackageId: 'one',
        packages: [{ id: 'one', title: 'Новый' }],
      })
      await Promise.all([
        sync({ proposalId: newProposal, tenantId }),
        sync({ proposalId: newProposal, tenantId }),
      ])
      const fresh = await E.findById(newEvent).lean()
      assert.equal(fresh.additionalEvents.length, 1)
      assert.equal(fresh.syncVersion, 2)
    } finally {
      await mongoose.disconnect()
      child.kill()
      await exited
      assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()))
      assert.ok(path.basename(dir).startsWith('vedelo-proposal-task-'))
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
)
