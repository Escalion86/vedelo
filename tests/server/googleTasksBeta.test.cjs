const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const mongoose = require('mongoose')
const { NextResponse, NextRequest } = require('next/server')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const load = (file, mocks) => {
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)((name) => {
    if (!(name in mocks)) throw Error(`Missing mock: ${name}`)
    return mocks[name]
  }, loaded, loaded.exports)
  return loaded.exports
}

test('Google Tasks beta: persistence, provider lifecycle and access', { timeout: 120000 }, async (t) => {
  await loadBindings()
  const helpers = await import('../../helpers/googleTasksBeta.mjs')
  const binary = process.env.GOOGLE_TASKS_TEST_MONGOD || 'C:/Program Files/MongoDB/Server/6.0/bin/mongod.exe'
  assert.ok(fs.existsSync(binary), 'Set GOOGLE_TASKS_TEST_MONGOD to run the isolated MongoDB tests')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedelo-google-tasks-'))
  const probe = net.createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const child = spawn(binary, ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet'], { stdio: 'ignore', windowsHide: true })
  const exited = once(child, 'exit')
  try {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/tasks_beta_test`, { serverSelectionTimeoutMS: 30000 })
    const schema = load('schemas/eventsSchema.js', { mongoose, './documentSchema': new mongoose.Schema({}) }).default
    const Events = mongoose.model('TasksBetaTestEvents', new mongoose.Schema(schema, { timestamps: true }))
    const Links = load('models/GoogleAdditionalLinks.js', { mongoose }).default
    await Links.init()
    const O = mongoose.Schema.Types.ObjectId
    const Settings = mongoose.model('TasksBetaSite', new mongoose.Schema({ tenantId: O, timeZone: String, custom: mongoose.Schema.Types.Mixed }))
    const Users = mongoose.model('TasksBetaUsers', new mongoose.Schema({ tenantId: O, googleCalendar: mongoose.Schema.Types.Mixed }))
    const tenantId = String(new mongoose.Types.ObjectId())
    const otherTenant = String(new mongoose.Types.ObjectId())
    const user = { _id: tenantId, tenantId, role: 'dev', googleCalendar: { enabled: true, refreshToken: 'mock', scope: helpers.GOOGLE_TASKS_SCOPE,
      calendarId: 'calendar', tasksBeta: { enabled: true, defaultMode: 'task', taskListId: 'list' } } }
    await Users.create(user)
    await Settings.create({ tenantId, timeZone: 'Asia/Krasnoyarsk' })
    const remote = { event: new Map(), task: new Map() }
    let calls = [], seq = 0, loseInsert = false, forbiddenInsert = false
    const client = (kind) => ({
      get: async (params) => {
        const id = params.task || params.eventId
        calls.push([kind, 'get', id])
        if (!remote[kind].has(id)) throw Object.assign(Error('missing'), { code: 404 })
        return { data: structuredClone(remote[kind].get(id)) }
      },
      insert: async ({ requestBody }) => {
        calls.push([kind, 'insert'])
        if (forbiddenInsert) throw Object.assign(Error('disabled'), { code: 403 })
        const id = requestBody.id || `remote-${++seq}`
        remote[kind].set(id, { ...structuredClone(requestBody), id })
        if (loseInsert) { loseInsert = false; throw Error('network') }
        return { data: { id } }
      },
      patch: async (params) => {
        const id = params.task || params.eventId
        calls.push([kind, 'patch', id])
        remote[kind].set(id, { ...remote[kind].get(id), ...structuredClone(params.requestBody) })
        return { data: remote[kind].get(id) }
      },
      delete: async (params) => { const id = params.task || params.eventId; calls.push([kind, 'delete', id]); remote[kind].delete(id); return { data: {} } },
      list: async () => ({ data: { items: Array.from(remote[kind].values()) } }),
    })
    const calendar = { events: client('event') }
    const tasks = { tasks: client('task'), tasklists: { list: async () => ({ data: { items: [{ id: 'list', title: 'Ведело' }] } }) } }
    let allowCalendarSync = true
    const Clients = mongoose.model('TaskDescriptionClients', new mongoose.Schema({ tenantId: O }, { strict: false }))
    const Transactions = mongoose.model('TaskDescriptionTransactions', new mongoose.Schema({ tenantId: O, eventId: O }, { strict: false }))
    const Services = mongoose.model('TaskDescriptionServices', new mongoose.Schema({ tenantId: O }, { strict: false }))
    const calendarSettings = load('server/googleUserCalendarClient.js', {
      googleapis: { google: {} }, '@helpers/constants': { DEFAULT_GOOGLE_CALENDAR_REMINDERS: {} },
    })
    const description = load('server/googleEventDescription.js', {
      '@models/Clients': Clients, '@models/Transactions': Transactions, '@models/Services': Services,
      '@server/dbConnect': async () => {}, '@helpers/constants': { TRANSACTION_CATEGORIES: [] },
      '@helpers/transactionCategory.mjs': await import('../../helpers/transactionCategory.mjs'),
      '@helpers/workItemTerminology.mjs': await import('../../helpers/workItemTerminology.mjs'),
      '@helpers/formatAddress': load('helpers/formatAddress.js', {}).default,
      '@server/googleUserCalendarClient': calendarSettings,
      '@helpers/brand.mjs': { getCanonicalBaseUrl: () => 'https://vedelo.ru' },
    })
    const service = load('server/googleAdditionalSync.js', {
      '@server/googleEventDescription': description,
      'node:crypto': require('node:crypto'), googleapis: { google: { tasks: () => tasks } },
      '@models/Events': Events, '@models/SiteSettings': Settings, '@models/GoogleAdditionalLinks': Links,
      '@server/dbConnect': async () => {}, '@server/getUserTariffAccess': async () => ({ allowCalendarSync }),
      '@server/googleUserCalendarClient': { getUserOAuthClient: () => ({}), getUserCalendarClient: () => calendar, normalizeCalendarReminders: () => ({ useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] }) },
      '@helpers/brand.mjs': { getCanonicalBaseUrl: () => 'https://vedelo.ru' }, '@helpers/googleTasksBeta.mjs': helpers,
    })
    const make = (mode = 'task', extra = {}) => Events.create({ tenantId, additionalEvents: [{ title: 'Позвонить', date: '2026-10-25T19:00:00Z', googleSyncMode: mode, ...extra }] })
    const sync = (event, extra = {}) => service.syncGoogleAdditionalEvents(user, { eventId: event._id, ...extra })
    const linkFor = (event) => Links.findOne({ tenantId, eventId: event._id }).lean()
    const change = (event, fields) => Events.updateOne({ _id: event._id, tenantId }, { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`additionalEvents.0.${k}`, v])) })
    await t.test('creates once, uses tenant timezone date, updates and marks/unmarks completed', async () => {
      const event = await make()
      await sync(event); const link = await linkFor(event)
      assert.equal(remote.task.get(link.remoteId).due, '2026-10-26T00:00:00.000Z')
      const count = seq
      await sync(event); assert.equal(seq, count)
      await change(event, { done: true, doneAt: new Date(), title: 'Договор' }); await sync(event)
      assert.equal(remote.task.get(link.remoteId).status, 'completed')
      await change(event, { done: false, doneAt: null, date: null }); await sync(event)
      assert.equal(remote.task.get(link.remoteId).status, 'needsAction')
      assert.equal(remote.task.get(link.remoteId).due, null)
    })
    await t.test('task notes include configured event details, refresh existing tasks and isolate related tenants', async () => {
      const client = await Clients.create({ tenantId, firstName: 'Анна', phone: 79991234567 })
      const colleague = await Clients.create({ tenantId: otherTenant, firstName: 'ЧУЖОЙ', phone: 78888888888 })
      const event = await make('task', { description: 'Уточнить детали' })
      await Events.updateOne({ _id: event._id }, { $set: { title: 'Свадьба', eventType: 'Свадьба',
        description: '<p>Описание заказа</p>', clientId: client._id, colleagueId: colleague._id, isTransferred: true,
        contractSum: 15000, financeComment: 'Предоплата', eventDate: new Date('2026-11-01T10:00:00Z') } })
      await Transactions.create({ tenantId, eventId: event._id, amount: 5000, type: 'income', comment: 'Своя оплата' })
      await Transactions.create({ tenantId: otherTenant, eventId: event._id, amount: 9999, comment: 'ЧУЖАЯ ОПЛАТА' })
      await sync(event)
      const link = await linkFor(event)
      let notes = remote.task.get(link.remoteId).notes
      for (const text of ['Задача по мероприятию', 'Описание задачи:', 'Уточнить детали', 'Свадьба', 'Дата мероприятия:', 'Анна', '+79991234567', 'Описание заказа', 'Предоплата', 'Своя оплата']) assert.ok(notes.includes(text), text)
      assert.doesNotMatch(notes, /ЧУЖОЙ|78888888888|ЧУЖАЯ ОПЛАТА|<p>/)
      user.googleCalendar.syncSettings = { showClient: false, showDescription: false, showTransactions: false, showContractSum: false, showFinanceComment: false, showAdditionalEvents: false, showEventLink: false }
      await sync(event)
      notes = remote.task.get(link.remoteId).notes
      assert.doesNotMatch(notes, /Анна|79991234567|Описание заказа|Своя оплата|Предоплата|15000|https:\/\/vedelo/)
      assert.ok(notes.includes('Уточнить детали'))
      assert.ok(notes.endsWith(`[vedelo:${link.marker}]`))
      await Settings.updateOne({ tenantId }, { custom: { primaryEntityTerminology: 'orders' } })
      await change(event, { description: 'Я'.repeat(12000) }); await sync(event)
      notes = remote.task.get(link.remoteId).notes
      assert.ok(notes.startsWith('Задача по заказу'))
      assert.equal(notes.length, 8192)
      assert.ok(notes.endsWith(`[vedelo:${link.marker}]`))
      delete user.googleCalendar.syncSettings
      await Settings.updateOne({ tenantId }, { custom: {} })
    })
    await t.test('pulls Google completion and reopening into Mongo with syncVersion', async () => {
      const event = await make(); await sync(event); const link = await linkFor(event)
      remote.task.get(link.remoteId).status = 'completed'
      remote.task.get(link.remoteId).completed = new Date().toISOString()
      assert.equal((await sync(event)).changed, true)
      assert.equal((await Events.findById(event._id)).additionalEvents[0].done, true)
      remote.task.get(link.remoteId).status = 'needsAction'
      await sync(event)
      const saved = await Events.findById(event._id)
      assert.equal(saved.additionalEvents[0].done, false); assert.equal(saved.syncVersion, 3)
    })
    await t.test('event duration, completion deletion and recreation use a fresh Google ID', async () => {
      const event = await make('event', { googleDurationMinutes: 90 }); await sync(event)
      const first = await linkFor(event); const entry = remote.event.get(first.remoteId)
      assert.equal(new Date(entry.end.dateTime) - new Date(entry.start.dateTime), 90 * 60000)
      assert.equal(entry.reminders.overrides[0].minutes, 60)
      await change(event, { done: true }); await sync(event); assert.equal(remote.event.has(first.remoteId), false)
      await change(event, { done: false }); await sync(event)
      assert.notEqual((await linkFor(event)).remoteId, first.remoteId)
    })
    await t.test('mode changes clean the old object; none and deletion remove remote copies', async () => {
      const event = await make('event'); await sync(event); const first = await linkFor(event)
      await change(event, { googleSyncMode: 'task' }); await sync(event)
      const second = await linkFor(event)
      assert.equal(remote.event.has(first.remoteId), false); assert.ok(remote.task.has(second.remoteId))
      await change(event, { googleSyncMode: 'none' }); await sync(event)
      assert.equal(remote.task.has(second.remoteId), false)
      await change(event, { googleSyncMode: 'task' }); await sync(event)
      const third = await linkFor(event)
      await Events.deleteOne({ _id: event._id, tenantId }); await sync(event)
      assert.equal(remote.task.has(third.remoteId), false)
    })
    await t.test('first beta edit also removes a legacy Google event deleted before initial reconciliation', async () => {
      const event = await make('event', { googleCalendarEventId: 'legacy-removed' })
      remote.event.set('legacy-removed', { id: 'legacy-removed' })
      const previousEvent = event.toObject()
      await Events.updateOne({ _id: event._id, tenantId }, { additionalEvents: [] })
      await sync(event, { previousEvent })
      assert.equal(remote.event.has('legacy-removed'), false)
    })
    await t.test('lost insert response recovers marker without duplicate; definite refusal is retryable', async () => {
      const event = await make(); loseInsert = true; await sync(event)
      assert.equal((await linkFor(event)).pendingCreate, true)
      const count = seq; await sync(event); assert.equal(seq, count)
      assert.equal((await linkFor(event)).pendingCreate, false)
      const refused = await make(); forbiddenInsert = true; await sync(refused)
      assert.equal((await linkFor(refused)).pendingCreate, false)
      forbiddenInsert = false; await sync(refused); assert.ok((await linkFor(refused)).remoteId)
    })
    await t.test('remote deletion is suppressed until explicit restoration', async () => {
      const event = await make(); await sync(event); const link = await linkFor(event)
      remote.task.delete(link.remoteId); await sync(event)
      assert.equal((await linkFor(event)).error, 'deleted_in_google')
      const count = seq; await sync(event); assert.equal(seq, count)
      await sync(event, { restoreId: link._id }); assert.equal(seq, count + 1)
    })
    await t.test('parallel sync claims one durable lease', async () => {
      const event = await make(); const count = seq
      await Promise.all([sync(event), sync(event)])
      assert.equal(seq, count + 1)
    })
    await t.test('foreign event, non-dev, impersonation, pause, tariff and unchecked imports do not touch providers', async () => {
      const event = await Events.create({ tenantId: otherTenant, additionalEvents: [{ title: 'Чужая', googleSyncMode: 'task' }] })
      calls = []; await sync(event); assert.equal(calls.length, 0)
      for (const patch of [{ role: 'admin' }, { impersonation: { active: true } }, { googleCalendar: { ...user.googleCalendar, enabled: false } }]) {
        await service.syncGoogleAdditionalEvents({ ...user, ...patch }); assert.equal(calls.length, 0)
      }
      allowCalendarSync = false; await service.syncGoogleAdditionalEvents(user); assert.equal(calls.length, 0); allowCalendarSync = true
      const imported = await make(); await Events.updateOne({ _id: imported._id }, { importedFromFile: true, fileImportChecked: false })
      await sync(imported); assert.equal(calls.length, 0)
    })
    await t.test('normalization ignores forged provider IDs and modes outside developer beta', () => {
      const old = { _id: 'local', googleCalendarEventId: 'trusted', googleSyncMode: 'task', googleDurationMinutes: 60 }
      assert.equal(helpers.additionalGoogleFields({ _id: 'foreign', googleCalendarEventId: 'evil', googleSyncMode: 'task' }, [old], { role: 'user' }).googleCalendarEventId, '')
      const stable = helpers.additionalGoogleFields({ _id: 'local' }, [old], user)
      assert.equal(stable._id, 'local'); assert.equal(stable.googleSyncMode, 'task'); assert.equal(stable.googleCalendarEventId, 'trusted')
      assert.equal(helpers.additionalGoogleFields({ googleSyncMode: 'none' }, [], { role: 'user' }).googleSyncMode, 'event')
    })
    await t.test('API rejects non-dev and foreign link restoration, validates chosen Google list', async () => {
      let ctx = { user, tenantId }
      const route = load('app/api/google-calendar/tasks-beta/route.js', {
        'next/server': { NextResponse }, mongoose, '@models/Users': Users, '@models/GoogleAdditionalLinks': Links,
        '@server/getTenantContext': async () => ctx, '@server/getUserTariffAccess': async () => ({ allowCalendarSync }),
        '@helpers/googleTasksBeta.mjs': helpers, '@server/googleAdditionalSync': service,
      })
      const post = (body) => route.POST(new NextRequest('http://localhost/api/google-calendar/tasks-beta', { method: 'POST', body: JSON.stringify(body) }))
      ctx = { user: { ...user, role: 'user' }, tenantId }; assert.equal((await post({ action: 'settings' })).status, 403)
      ctx = { user: { ...user, impersonation: { active: true } }, tenantId }; assert.equal((await route.GET()).status, 403)
      ctx = { user, tenantId }
      const foreign = await Links.create({ tenantId: otherTenant, userId: otherTenant, eventId: new mongoose.Types.ObjectId(), taskId: new mongoose.Types.ObjectId(), marker: 'foreign', suppressed: true })
      assert.equal((await post({ action: 'restore', id: String(foreign._id) })).status, 404)
      assert.equal((await post({ action: 'settings', defaultMode: 'task', taskListId: 'foreign' })).status, 400)
      assert.equal((await post({ action: 'settings', defaultMode: 'task', taskListId: 'list' })).status, 200)
      const result = await (await route.GET()).json()
      assert.equal(result.data.errors.some((item) => item._id === String(foreign._id)), false)
    })
    await t.test('OAuth requests Tasks only explicitly for developer and never for import', async () => {
      let ctx = { user, tenantId }, requested
      const route = load('app/api/google-calendar/auth-url/route.js', {
        'next/server': { NextResponse }, crypto: require('node:crypto'),
        '@models/Users': Users, '@server/dbConnect': async () => {},
        '@server/getTenantContext': async () => ctx, '@server/getUserTariffAccess': async () => ({ allowCalendarSync: true, allowAi: true }),
        '@helpers/googleTasksBeta.mjs': helpers,
        '@server/trustedOrigin': { resolveTrustedRequestOrigin: () => 'http://localhost:3000' },
        '@server/googleUserCalendarClient': { READ_SCOPE: 'read', WRITE_SCOPE: 'write', getOAuthClient: () => ({ generateAuthUrl: (options) => { requested = options; return 'https://accounts.google.com/mock' } }) },
      })
      const get = (query) => route.GET(new NextRequest(`http://localhost:3000/api/google-calendar/auth-url?${query}`))
      assert.equal((await get('tasks=1')).status, 200)
      assert.deepEqual(requested.scope, ['write', helpers.GOOGLE_TASKS_SCOPE])
      assert.equal(requested.include_granted_scopes, true)
      await get(''); assert.deepEqual(requested.scope, ['write'])
      assert.equal((await get('tasks=1&purpose=import')).status, 403)
      ctx = { tenantId, user: { ...user, role: 'admin' } }
      assert.equal((await get('tasks=1')).status, 403)
    })
  } finally {
    await mongoose.disconnect()
    child.kill(); await exited
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(dir).startsWith('vedelo-google-tasks-'))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
