const { once } = require('node:events')
const { existsSync, mkdtempSync, rmSync } = require('node:fs')
const { createServer } = require('node:net')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawn } = require('node:child_process')
const assert = require('node:assert/strict')
const test = require('node:test')
const mongoose = require('mongoose')
const { loadBindings } = require('next/dist/build/swc')
const { loader } = require('./stageFLoader.cjs')

const defer = () => {
  let resolve
  const promise = new Promise((complete) => { resolve = complete })
  return { promise, resolve }
}
const objectId = () => new mongoose.Types.ObjectId()

test('durable Google Calendar worker on standalone MongoDB', { timeout: 120000 }, async (t) => {
  await loadBindings()
  const binary = process.env.GOOGLE_CALENDAR_SYNC_TEST_MONGOD ||
    'C:/Program Files/MongoDB/Server/6.0/bin/mongod.exe'
  assert.ok(existsSync(binary), 'Set GOOGLE_CALENDAR_SYNC_TEST_MONGOD to an isolated mongod binary')
  const directory = mkdtempSync(join(tmpdir(), 'vedelo-calendar-queue-'))
  const probe = createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const child = spawn(binary, [
    '--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet',
  ], { stdio: 'ignore', windowsHide: true })
  const exited = once(child, 'exit')
  try {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/calendar_queue_test`, { serverSelectionTimeoutMS: 30000 })
    const schema = loader()('schemas/eventsSchema.js').default
    const Users = mongoose.model('CalendarQueueFixtureUser', new mongoose.Schema({
      tenantId: mongoose.Schema.Types.ObjectId,
      role: String,
      googleCalendar: mongoose.Schema.Types.Mixed,
    }))
    const tenantId = objectId()
    const otherTenantId = objectId()
    const account = (await Users.create({
      _id: tenantId,
      tenantId,
      role: 'dev',
      googleCalendar: { enabled: true, refreshToken: 'fixture', calendarId: 'fixture-calendar' },
    })).toObject()
    const dbConnect = async () => {}
    const access = { allowCalendarSync: true }
    const after = []
    let syncProvider
    let deleteProvider
    const loadModels = loader({ '@schemas/eventsSchema': schema })
    const Events = loadModels('models/Events.js').default
    const Deletions = loadModels('models/GoogleCalendarDeletions.js').default
    await Promise.all([Events.init(), Deletions.init()])
    const loadQueue = loader({
      '@models/Events': Events,
      '@models/GoogleCalendarDeletions': Deletions,
      '@models/Users': Users,
      '@server/CRUD': {
        updateEventInCalendar: (...args) => syncProvider(...args),
        deleteCalendarResourcesForWork: (...args) => deleteProvider(...args),
      },
      '@server/dbConnect': dbConnect,
      '@server/getUserTariffAccess': async () => access,
      '@server/googleImportContext': {
        googleImportUserFilter: (_id, tenantId) => ({
          _id, tenantId: String(_id) === String(tenantId) ? { $in: [tenantId, null] } : tenantId,
        }),
      },
      '@server/googleUserCalendarClient': {
        getUserCalendarId: (user) => user.googleCalendar.calendarId,
        normalizeCalendarSettings: (user) => user?.googleCalendar,
      },
      'next/server': { after: (callback) => { after.push(callback) } },
    })
    const queue = loadQueue('server/googleCalendarSyncQueue.js')
    const readJob = (id) => Events.findOne({ _id: id, tenantId }).select('+calendarSyncJob').lean()
    const createQueued = async (fields = {}, user = account) => {
      const event = { tenantId, eventDate: new Date('2030-10-01T12:00:00Z'), ...fields }
      return Events.create({
        ...event,
        ...queue.getGoogleCalendarSyncCreateFields({ event, user, access }),
      })
    }
    const dispose = (id) => Events.deleteOne({ _id: id, tenantId })
    const immediateProviderSuccess = async (_event, _request, _user, _previous, beforeWrite) => {
      await beforeWrite()
      return { data: { id: 'fixture-google-event' } }
    }

    await t.test('after responds before provider, lease isolates tenants, and latest generation wins', async () => {
      const taskId = objectId()
      const created = await createQueued({ additionalEvents: [{
        _id: taskId, title: 'Fixture call', date: new Date('2030-10-02T12:00:00Z'),
      }] })
      assert.equal(created.calendarSyncStatus, 'pending')
      assert.equal(created.toJSON().calendarSyncJob, undefined)
      assert.equal((await Events.findById(created._id).lean()).calendarSyncJob, undefined)
      assert.equal(await queue.getGoogleCalendarSyncAccount(account._id, otherTenantId), null)
      const started = defer()
      const release = defer()
      syncProvider = async (event, _request, _user, _previous, beforeWrite, options) => {
        await beforeWrite()
        assert.equal(options.requestOptions.retry, false)
        assert.equal(options.requestOptions.timeout, 8000)
        started.resolve()
        await release.promise
        await beforeWrite()
        return { data: { id: event._id } }
      }
      queue.scheduleGoogleCalendarSync(tenantId, created._id, { generation: created.calendarSyncJob.generation })
      assert.equal(after.length, 1)
      const running = after.shift()()
      await started.promise
      const runningEvent = await readJob(created._id)
      assert.equal(runningEvent.updatedAt.getTime(), created.updatedAt.getTime())
      assert.equal(await queue.runGoogleCalendarSync(otherTenantId, created._id), 'busy')
      assert.equal(await queue.runGoogleCalendarSync(tenantId, created._id), 'busy')
      const eventDate = new Date('2030-10-08T12:00:00Z')
      const current = { ...runningEvent, eventDate, additionalEvents: [] }
      const update = queue.getGoogleCalendarSyncUpdate({ event: current, previousEvent: runningEvent, user: account, access })
      await Events.updateOne({ tenantId, _id: created._id }, {
        ...update, $set: { ...update.$set, eventDate, additionalEvents: [], syncVersion: 2 },
      })
      release.resolve()
      await running
      const newerWork = await readJob(created._id)
      assert.equal(newerWork.calendarSyncStatus, 'pending')
      assert.notEqual(newerWork.calendarSyncJob.generation, runningEvent.calendarSyncJob.generation)
      assert.equal(newerWork.calendarSyncJob.leaseToken, undefined)
      assert.equal(String(newerWork.calendarSyncJob.removedTasks[0]._id), String(taskId))

      syncProvider = async (event, request, user, previous, beforeWrite) => {
        assert.equal(event.eventDate.getTime(), eventDate.getTime())
        assert.equal(String(previous.additionalEvents[0]._id), String(taskId))
        return immediateProviderSuccess(event, request, user, previous, beforeWrite)
      }
      assert.equal(await queue.runGoogleCalendarSync(tenantId, created._id, { connectionKey: 'wrong' }), 'busy')
      assert.equal(await queue.runGoogleCalendarSync(tenantId, created._id), 'synced')
      const done = await readJob(created._id)
      assert.equal(done.calendarSyncStatus, '')
      assert.equal(done.calendarSyncJob, undefined)
      assert.equal(done.syncVersion, 2)
      await dispose(created._id)
    })

    await t.test('schedules bounded attempts and cron resumes due jobs without a browser', async () => {
      const created = await createQueued()
      syncProvider = async () => { throw Object.assign(new Error('fixture'), { code: 503 }) }
      assert.equal(await queue.runGoogleCalendarSync(tenantId, created._id), 'retrying')
      const first = await readJob(created._id)
      assert.equal(first.calendarSyncStatus, 'pending')
      assert.equal(first.calendarSyncJob.attempts, 1)
      assert.equal(await queue.runGoogleCalendarSync(tenantId, created._id), 'busy')
      await Events.updateOne({ tenantId, _id: created._id }, {
        $set: { 'calendarSyncJob.nextAttemptAt': new Date(0), 'calendarSyncJob.attempts': 3 },
      })
      await queue.runDueGoogleCalendarJobs()
      const failed = await readJob(created._id)
      assert.equal(failed.calendarSyncStatus, 'failed')
      assert.equal(failed.calendarSyncError, 'calendar_sync_failed')
      assert.equal(failed.syncVersion, 1)
      await dispose(created._id)
    })

    await t.test('reload preserves Tasks beta suppression for an impersonated request', async () => {
      const impersonated = await queue.getGoogleCalendarSyncAccount(account._id, tenantId, true)
      const created = await createQueued({}, impersonated)
      assert.equal((await readJob(created._id)).calendarSyncJob.suppressTasksBeta, true)
      syncProvider = async (event, request, user, previous, beforeWrite) => {
        assert.equal(user.role, 'dev')
        assert.equal(user.impersonation?.active, true)
        return immediateProviderSuccess(event, request, user, previous, beforeWrite)
      }
      assert.equal(await queue.runGoogleCalendarSync(tenantId, created._id), 'synced')
      await dispose(created._id)
    })

    await t.test('revalidates account and tariff before touching Google and skips unchecked imports', async () => {
      const created = await createQueued()
      syncProvider = async () => assert.fail('a revoked account cannot contact Google')
      await Users.updateOne({ _id: tenantId, tenantId }, { $set: { 'googleCalendar.refreshToken': 'rotated' } })
      assert.equal(await queue.runGoogleCalendarSync(tenantId, created._id), 'failed')
      assert.equal((await readJob(created._id)).calendarSyncError, 'calendar_sync_connection_required')
      await Users.updateOne({ _id: tenantId, tenantId }, { $set: { 'googleCalendar.refreshToken': 'fixture' } })
      const another = await createQueued()
      access.allowCalendarSync = false
      assert.equal(await queue.runGoogleCalendarSync(tenantId, another._id), 'failed')
      assert.equal((await readJob(another._id)).calendarSyncError, 'calendar_sync_unavailable')
      access.allowCalendarSync = true

      const duringAttempt = await createQueued()
      syncProvider = async (_event, _request, _user, _previous, beforeWrite) => {
        await beforeWrite()
        access.allowCalendarSync = false
        await beforeWrite()
        assert.fail('subsequent writes must re-check a changed tariff')
      }
      assert.equal(await queue.runGoogleCalendarSync(tenantId, duringAttempt._id), 'failed')
      assert.equal((await readJob(duringAttempt._id)).calendarSyncError, 'calendar_sync_unavailable')
      access.allowCalendarSync = true

      const imported = await createQueued({ importedFromFile: true, fileImportChecked: false })
      assert.equal(imported.calendarSyncStatus, '')
      const fromGoogle = await createQueued({ importedFromCalendar: true, calendarImportChecked: false })
      assert.equal(fromGoogle.calendarSyncStatus, '')
      await Promise.all([created, another, duringAttempt, imported, fromGoogle].map(({ _id }) => dispose(_id)))
    })

    await t.test('delete persists cleanup and waits for an in-flight write without keeping the work visible', async () => {
      const created = await createQueued({
        additionalEvents: [{ title: 'Fixture task', date: new Date('2030-10-12T12:00:00Z') }],
      })
      const started = defer()
      const release = defer()
      syncProvider = async (_event, _request, _user, _previous, beforeWrite) => {
        await beforeWrite()
        started.resolve()
        await release.promise
        await beforeWrite()
      }
      const run = queue.runGoogleCalendarSync(tenantId, created._id)
      await started.promise
      assert.equal(await queue.prepareGoogleCalendarDeletion(await readJob(created._id), account), true)
      await dispose(created._id)
      deleteProvider = async () => assert.fail('cleanup must wait out the previous request')
      await queue.runGoogleCalendarDeletion(tenantId, created._id)
      release.resolve()
      assert.equal(await run, 'obsolete')
      const filter = { tenantId, eventId: created._id }
      assert.equal(await Deletions.countDocuments(filter), 1)
      await Deletions.updateOne(filter, { $set: { nextAttemptAt: new Date(0) } })
      let cleaned = false
      deleteProvider = async (job, _user, _options, beforeWrite) => {
        assert.equal(String(job.tasks[0]._id), String(created.additionalEvents[0]._id))
        await beforeWrite()
        cleaned = true
      }
      await queue.runDueGoogleCalendarJobs()
      assert.equal(cleaned, true)
      assert.equal(await Deletions.countDocuments(filter), 0)
    })
  } finally {
    await mongoose.disconnect()
    child.kill()
    await exited
    rmSync(directory, { recursive: true, force: true })
  }
})
