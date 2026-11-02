const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net')
const { spawn } = require('node:child_process'), { once } = require('node:events')
const mongoose = require('mongoose'), { NextResponse } = require('next/server')
const { loadBindings, transformSync } = require('next/dist/build/swc')
function load(file, mocks) {
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), { filename: file, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } })
  const out = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => { assert.ok(name in mocks, name); return mocks[name] }, out, out.exports)
  return out.exports
}
test('Google import: real Mongo, mobile context, separate OAuth and durable replay', { skip: !process.env.GOOGLE_IMPORT_TEST_MONGOD, timeout: 90000 }, async t => {
  await loadBindings()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedelo-google-import-'))
  const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r))
  const child = spawn(process.env.GOOGLE_IMPORT_TEST_MONGOD, ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet'], { stdio: 'ignore', windowsHide: true }), exited = once(child, 'exit')
  try {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/google_import_test`, { serverSelectionTimeoutMS: 30000 })
    const O = mongoose.Schema.Types.ObjectId, Mixed = mongoose.Schema.Types.Mixed
    const Users = mongoose.model('GoogleTestUsers', new mongoose.Schema({ tenantId: O, archive: Boolean, googleCalendar: Mixed, googleCalendarImport: Mixed }))
    const Sessions = mongoose.model('GoogleTestSessions', new mongoose.Schema({ userId: O, tenantId: O, revokedAt: Date, expiresAt: Date, googleOAuthStateHash: String, googleOAuthStateExpiresAt: Date }))
    const Events = mongoose.model('GoogleTestEvents', new mongoose.Schema({ tenantId: O, clientId: O, googleCalendarId: String, googleCalendarCalendarId: String }, { strict: false, timestamps: true }))
    const Clients = mongoose.model('GoogleTestClients', new mongoose.Schema({ tenantId: O, phone: String }, { strict: false }))
    const Operations = load('models/GoogleImportOperations.js', { mongoose }).default
    await Operations.init()
    const operation = load('server/googleImportOperation.js', { 'node:crypto': require('node:crypto'), '@models/GoogleImportOperations': Operations })
    const a = new mongoose.Types.ObjectId(), b = new mongoose.Types.ObjectId()
    await Users.create({ _id: a, tenantId: a, googleCalendar: { refreshToken: 'sync-private', calendarId: 'sync-source' }, googleCalendarImport: { refreshToken: 'import-private', calendarId: 'source', calendarName: 'Source' } })
    await Users.create({ _id: b, tenantId: b, googleCalendarImport: { refreshToken: 'foreign-secret', calendarId: 'foreign' } })
    let context = { authType: 'mobile', user: { _id: a }, tenantId: String(a) }
    const scopes = load('server/googleImportContext.js', { '@models/Users': Users, '@server/dbConnect': async () => {}, '@server/getRequestContext': async () => context })
    let access = { allowCalendarSync: true, allowAi: true, eventsPerMonth: 100 }
    const calendar = {
      normalizeImportCalendarSettings: u => u.googleCalendarImport || {},
      normalizeCalendarSettings: u => u.googleCalendar || {},
      normalizeCalendarReminders: x => x, normalizeCalendarSyncSettings: x => x, normalizeCalendarStatusColors: x => x,
      getUserImportCalendarClient: u => u.googleCalendarImport?.refreshToken ? {} : null,
      getUserImportCalendarId: u => u.googleCalendarImport?.calendarId,
      listUserImportCalendars: async () => [{ id: 'source', summary: 'Source' }],
      getOAuthClient: () => ({ getToken: async () => ({ tokens: { refresh_token: 'new-import-private', access_token: 'new-access' } }), generateAuthUrl: args => { capturedAuth = args; return 'https://accounts.google.com/o/oauth2/v2/auth?state=test' } }),
      READ_SCOPE: 'read-scope', WRITE_SCOPE: 'write-scope',
    }
    let capturedAuth
    const common = { 'next/server': { NextResponse }, '@models/Users': Users, '@server/dbConnect': async () => {}, '@server/googleImportContext': scopes, '@server/getUserTariffAccess': async () => access, '@server/googleUserCalendarClient': calendar }
    const status = load('app/api/google-calendar/import-status/route.js', common).GET
    const select = load('app/api/google-calendar/import-select/route.js', common).POST
    const disconnect = load('app/api/google-calendar/import-disconnect/route.js', common).POST
    const mobileHelpers = load('server/mobile/routeHelpers.js', { 'next/server': { NextResponse } })
    const syncHelpers = load('server/mobile/googleCalendar.js', {})
    const syncNormalizer = load('server/googleUserCalendarClient.js', { googleapis: { google: {} }, '@helpers/constants': { DEFAULT_GOOGLE_CALENDAR_REMINDERS: { useDefault: true, overrides: [] } } }).normalizeCalendarSettings
    let listSyncCalendars = async () => [{ id: 'target', summary: 'Target', accessRole: 'writer' }, { id: 'read-only', accessRole: 'reader' }]
    const syncMocks = { ...common, '@server/getRequestContext': async () => context, '@server/mobile/routeHelpers': mobileHelpers, '@server/mobile/googleCalendar': syncHelpers, '@server/googleUserCalendarClient': { ...calendar, normalizeCalendarSettings: syncNormalizer, listUserCalendars: (...args) => listSyncCalendars(...args) } }
    const syncSettings = load('app/api/mobile/v1/integrations/google-calendar/route.js', syncMocks)
    const syncSelect = load('app/api/mobile/v1/integrations/google-calendar/select/route.js', syncMocks).POST
    const syncCalendars = load('app/api/mobile/v1/integrations/google-calendar/calendars/route.js', syncMocks).GET
    const req = body => ({ url: 'https://vedelo.test/api/events/google-import?timeMin=2026-01-01&timeMax=2026-02-01', json: async () => body })
    await t.test('sync settings patch only selected fields, preserve PWA and concurrent changes, isolate tenants', async () => {
      await Users.updateOne({ _id: a, tenantId: a }, { $set: { 'googleCalendar.syncSettings': { showClient: true, showFinanceComment: false, futureSetting: 'retained' }, 'googleCalendar.statusColors': { active: '4', closed: '5', futureStatus: '7' }, 'googleCalendar.tasksBeta': { enabled: true, taskListId: 'private-task-list' } } })
      const patch = { syncSettings: { showClient: false }, statusColors: { draft: '3' } }
      assert.equal((await syncSettings.PATCH(req(patch))).status, 200)
      await Promise.all([syncSettings.PATCH(req({ syncSettings: { showEventLink: false } })), syncSettings.PATCH(req({ statusColors: { active: '9' } }))])
      const saved = (await Users.findById(a).lean()).googleCalendar
      assert.deepEqual(saved.syncSettings, { showClient: false, showFinanceComment: false, futureSetting: 'retained', showEventLink: false })
      assert.deepEqual(saved.statusColors, { active: '9', closed: '5', futureStatus: '7', draft: '3' })
      assert.equal(saved.tasksBeta.taskListId, 'private-task-list'); assert.equal(saved.refreshToken, 'sync-private')
      const dto = await (await syncSettings.GET(req())).json()
      assert.equal(dto.data.syncSettings.showFinanceComment, false); assert.equal(dto.data.statusColors.draft, '3')
      assert.ok(!JSON.stringify(dto).includes('private'))
      assert.equal((await syncSettings.PATCH(req({ refreshToken: 'injected' }))).status, 400)
      context = { user: { _id: a }, tenantId: String(b) }; assert.equal((await syncSettings.PATCH(req(patch))).status, 404)
      context = {}; assert.equal((await syncSettings.PATCH(req(patch))).status, 401)
      context = { user: { _id: a }, tenantId: String(a) }; access.allowCalendarSync = false
      assert.equal((await syncSettings.PATCH(req(patch))).status, 403); access.allowCalendarSync = true
    })
    await t.test('sync calendar selection requires write access, keeps preferences and cannot restore a disconnected account', async () => {
      assert.deepEqual((await (await syncCalendars(req())).json()).data.calendars.map(item => item.id), ['target'])
      assert.equal((await syncSelect(req({ calendarId: 'read-only' }))).status, 404)
      assert.equal((await syncSelect(req({ calendarId: 'foreign' }))).status, 404)
      assert.equal((await syncSelect(req({ calendarId: 'target' }))).status, 200)
      assert.equal((await Users.findById(a).lean()).googleCalendar.syncSettings.futureSetting, 'retained')
      const previous = listSyncCalendars
      listSyncCalendars = async () => { access.allowCalendarSync = false; assert.equal((await syncSettings.DELETE(req())).status, 200); access.allowCalendarSync = true; return previous() }
      assert.equal((await syncSelect(req({ calendarId: 'target' }))).status, 409)
      const cleared = (await Users.findById(a).lean()).googleCalendar
      assert.equal(cleared.refreshToken, ''); assert.equal(cleared.enabled, false); assert.equal(cleared.syncSettings.futureSetting, 'retained')
      listSyncCalendars = async () => { context = {}; return previous() }
      await Users.updateOne({ _id: a, tenantId: a }, { $set: { 'googleCalendar.refreshToken': 'sync-private' } })
      assert.equal((await syncSelect(req({ calendarId: 'target' }))).status, 401)
      context = { user: { _id: a }, tenantId: String(a) }; listSyncCalendars = previous
    })
    await t.test('public mobile DTO reloads only own credentials, wrong tenant and revoked denied', async () => {
      assert.equal((await (await status(req())).json()).data.calendarId, 'source')
      assert.ok(!JSON.stringify(await (await status(req())).json()).includes('private'))
      context = { user: { _id: a }, tenantId: String(b) }; assert.equal((await status(req())).status, 401)
      context = {}; assert.equal((await status(req())).status, 401)
      context = { authType: 'mobile', user: { _id: a }, tenantId: String(a) }
      assert.equal((await select(req({ calendarId: 'foreign' }))).status, 404)
      access.allowAi = false; assert.equal((await select(req({ calendarId: 'source' }))).status, 403); access.allowAi = true
    })
    const oauthState = await import('../../server/mobile/oauthState.js')
    const session = await Sessions.create({ userId: a, tenantId: a, expiresAt: new Date(Date.now() + 60000), revokedAt: null })
    context.mobileSessionId = String(session._id)
    const authUrl = load('app/api/mobile/v1/integrations/google-calendar/auth-url/route.js', { ...common, '@models/MobileSessions': Sessions, '@server/getRequestContext': async () => context, '@server/getAuthSecret': () => 'synthetic-secret', '@server/mobile/oauthState': oauthState, '@server/mobile/routeHelpers': load('server/mobile/routeHelpers.js', { 'next/server': { NextResponse } }) }).GET
    const callback = load('server/mobile/googleCalendarOAuth.js', { ...common, '@models/MobileSessions': Sessions, '@server/getAuthSecret': () => 'synthetic-secret', './oauthState.js': oauthState }).handleMobileGoogleCalendarCallback
    await t.test('import signed purpose, read-only scope, sync settings preserved, replay and revoke rejected', async () => {
      await authUrl({ url: 'https://vedelo.test/auth?purpose=import&appScheme=vedelo-dev' })
      assert.deepEqual(capturedAuth.scope, ['read-scope']); const state = capturedAuth.state
      const result = await callback({ code: 'synthetic-code', state }); assert.equal(result.headers.get('location'), 'vedelo-dev://more/import?gc_import_connected=1')
      const user = await Users.findById(a).lean(); assert.equal(user.googleCalendar.refreshToken, 'sync-private'); assert.equal(user.googleCalendarImport.refreshToken, 'new-import-private'); assert.equal(user.googleCalendarImport.calendarId, '')
      assert.match((await callback({ code: 'same', state })).headers.get('location'), /gc_error=state/)
      await authUrl({ url: 'https://vedelo.test/auth?purpose=import' }); await Sessions.updateOne({ _id: session._id, tenantId: a }, { revokedAt: new Date() })
      assert.match((await callback({ code: 'revoked', state: capturedAuth.state })).headers.get('location'), /gc_error=state/)
      access.allowAi = false; assert.equal((await authUrl({ url: 'https://vedelo.test/auth?purpose=import' })).status, 403); access.allowAi = true
      await select(req({ calendarId: 'source' }))
    })
    const helpers = await import('../../helpers/googleCalendarImport.mjs'), contacts = await import('../../helpers/aiEventDraftContacts.mjs'), hints = await import('../../helpers/aiEventDraftHints.mjs')
    let items = [], analyses = 0, analyze = async () => ({ content: JSON.stringify({ eventType: 'Тест' }) })
    const emptyFind = { find: () => ({ select: () => ({ lean: async () => [] }), lean: async () => [] }) }
    const route = load('app/api/events/google-import/route.js', {
      ...common, '@models/Events': Events, '@models/Clients': Clients, '@models/Services': emptyFind, '@models/AiUsage': emptyFind,
      '@models/SiteSettings': { findOne: () => ({ select: () => ({ lean: async () => ({ timeZone: 'UTC' }) }) }) },
      '@helpers/googleCalendarParsers': load('helpers/googleCalendarParsers.js', {}), '@helpers/googleCalendarImport.mjs': helpers,
      '@helpers/aiEventDraftContacts.mjs': contacts, '@helpers/aiEventDraftHints.mjs': hints,
      '@server/activityHistory': { recordActivityHistory: async () => {} }, '@server/aiSettings': { getTenantAiSettings: async () => ({}) },
      '@server/aiBilling': { getPlatformAiAccessQuote: async () => ({}), isAiBalanceError: e => e.code === 'BALANCE', getAiBalanceErrorMessage: () => 'Balance' },
      '@server/aiChatCompletion': { getAiAnalysisProviderConfig: () => ({ name: 'user_key' }), requestAiChatCompletion: async () => { analyses++; return analyze() } },
      '@server/googleCalendarClient': { listCalendarEvents: async () => ({ items }) }, '@server/googleImportOperation': operation,
    })
    const item = id => ({ id, summary: 'Работа', description: 'Клиент +7 900 000-00-01', start: { dateTime: '2026-01-15T10:00:00Z' }, end: { dateTime: '2026-01-15T11:00:00Z' } })
    const request = ids => req({ timeMin: '2026-01-01', timeMax: '2026-02-01', eventIds: ids, groupId: 'same-group', calendarId: 'source' })
    await t.test('concurrent imports + lost response create one event/client and charge once', async () => {
      items = [item('one')]
      let release, started; const ready = new Promise(r => { started = r }); analyze = async () => { started(); await new Promise(r => { release = r }); return { content: '{}' } }
      const first = route.POST(request(['one'])); await ready
      const second = await (await route.POST(request(['one']))).json(); assert.equal(second.data.results[0].status, 'error')
      release(); assert.equal((await (await first).json()).data.created, 1)
      assert.equal((await (await route.POST(request(['one']))).json()).data.results[0].status, 'duplicate')
      assert.equal(analyses, 1); assert.equal(await Events.countDocuments({ tenantId: a }), 1); assert.equal(await Clients.countDocuments({ tenantId: a }), 1)
      assert.equal(await Events.countDocuments({ tenantId: b }), 0)
    })
    await t.test('uncertain AI result recovers without a second provider call and retains review warning', async () => {
      items = [item('uncertain')]; analyze = async () => { throw new Error('PRIVATE_PROVIDER_DETAILS') }
      assert.equal((await (await route.POST(request(['uncertain']))).json()).data.results[0].status, 'error'); const count = analyses
      const result = await (await route.POST(request(['uncertain']))).json()
      assert.equal(result.data.results[0].status, 'created'); assert.match(result.data.results[0].warnings.join(), /Повторный платный разбор/)
      assert.equal(analyses, count); assert.ok(!JSON.stringify(result).includes('PRIVATE_PROVIDER_DETAILS')); assert.equal(await Clients.countDocuments({ tenantId: a }), 1)
    })
    await t.test('cached paid extraction survives failure before entity write', async () => {
      items = [{ ...item('write-failed'), description: 'Клиент +7 900 000-00-01. Стоимость 5000 рублей.' }]; analyze = async () => ({ content: '{"contractSum":5000}' })
      const original = Events.findOneAndUpdate
      Events.findOneAndUpdate = () => { throw new Error('temporary write failure') }
      try { assert.equal((await (await route.POST(request(['write-failed']))).json()).data.results[0].status, 'error') } finally { Events.findOneAndUpdate = original }
      const count = analyses; assert.equal((await (await route.POST(request(['write-failed']))).json()).data.created, 1); assert.equal(analyses, count)
      assert.equal((await Events.findOne({ tenantId: a, googleCalendarId: 'write-failed' }).lean()).contractSum, 5000)
    })
    await t.test('source mismatch, tariff and expired session cannot import foreign data', async () => {
      assert.equal((await route.POST(req({ timeMin: '2026-01-01', timeMax: '2026-02-01', calendarId: 'foreign' }))).status, 409)
      access.allowAi = false; assert.equal((await route.POST(request(['one']))).status, 403); access.allowAi = true
      context = {}; assert.equal((await route.GET(req())).status, 401)
      context = { user: { _id: a }, tenantId: String(b) }; assert.equal((await route.POST(request(['one']))).status, 401)
      context = { user: { _id: a }, tenantId: String(a) }
    })
    await t.test('revocation during analysis prevents client/event writes; explicit retry uses saved extraction', async () => {
      items = [item('revoked-in-flight')]
      analyze = async () => { context = {}; return { content: '{}' } }
      const result = await (await route.POST(request(['revoked-in-flight']))).json()
      assert.equal(result.data.created, 0); assert.equal(await Events.countDocuments({ tenantId: a, googleCalendarId: 'revoked-in-flight' }), 0)
      context = { user: { _id: a }, tenantId: String(a) }; const count = analyses
      assert.equal((await (await route.POST(request(['revoked-in-flight']))).json()).data.created, 1); assert.equal(analyses, count)
    })
    await t.test('lost write response is reconciled, deleted imported record is not resurrected', async () => {
      items = [item('lost-write')]; analyze = async () => ({ content: '{}' })
      const original = Events.findOneAndUpdate
      Events.findOneAndUpdate = async (...args) => { await original.apply(Events, args); throw new Error('lost write response') }
      try { await route.POST(request(['lost-write'])) } finally { Events.findOneAndUpdate = original }
      assert.equal((await (await route.POST(request(['lost-write']))).json()).data.results[0].status, 'duplicate')
      await Events.deleteOne({ tenantId: a, googleCalendarId: 'lost-write' })
      assert.equal((await (await route.POST(request(['lost-write']))).json()).data.results[0].status, 'duplicate')
      assert.equal(await Events.countDocuments({ tenantId: a, googleCalendarId: 'lost-write' }), 0)
    })
    await t.test('lease expiry fences old writers; foreign tenant has independent operation', async () => {
      let old, release, started; const ready = new Promise(r => { started = r })
      const scope = { tenantId: String(a), calendarId: 'source', sourceId: 'lease' }
      const first = operation.withGoogleImportOperation(scope, async op => { old = op; started(); await new Promise(r => { release = r }); await assert.rejects(op.assertCurrent(), { code: 'GOOGLE_IMPORT_BUSY' }) }); await ready
      await Operations.updateOne({ tenantId: a, kind: 'lock' }, { leaseUntil: new Date(0) })
      await operation.withGoogleImportOperation(scope, async op => { assert.equal(op.id, old.id); await op.save({ completed: true }) })
      await operation.withGoogleImportOperation({ ...scope, tenantId: String(b) }, async op => { assert.notEqual(op.id, old.id); assert.equal(op.row.completed, false) })
      release(); await first
    })
    await t.test('disconnect with expired tariff clears import only and legacy owner can read self', async () => {
      access.allowAi = false; await disconnect(req()); const user = await Users.findById(a).lean(); assert.equal(user.googleCalendar.refreshToken, 'sync-private'); assert.equal(user.googleCalendarImport.refreshToken, '')
      await Users.updateOne({ _id: a }, { $unset: { tenantId: 1 } }); assert.equal((await status(req())).status, 200)
      context = { user: { _id: a }, tenantId: String(b) }; assert.equal((await status(req())).status, 401)
    })
  } finally {
    await mongoose.disconnect(); child.kill(); await exited.catch(() => {})
    const resolved = path.resolve(dir)
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('vedelo-google-import-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  }
})
