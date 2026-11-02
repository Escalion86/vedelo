const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const load = (filename, mocks) => {
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } })
  const compiledModule = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => { assert.ok(id in mocks, id); return mocks[id] }, compiledModule, compiledModule.exports)
  return compiledModule.exports
}
const reply = { mobileSuccess: (data, status = 200) => ({ status, data }), mobileError: (code, message, status = 400) => ({ status, code, message }) }
const a = 'a'.repeat(24), b = 'b'.repeat(24), id = '1'.repeat(24), foreignId = '2'.repeat(24)
const query = data => ({ sort() { return this }, limit() { return this }, lean: async () => data })
const req = (tenant = a, body, suffix = '') => ({ url: `https://test/api${suffix}`, headers: new Headers({ authorization: tenant }), json: async () => body })

test('mobile Telegram conversations: tenant, revoked session, tariff and strict mutations', async () => {
  await loadBindings()
  const rows = [{ _id: id, tenantId: a, lastIncomingAt: new Date(), unreadCount: 2, status: 'open' }, { _id: foreignId, tenantId: b, unreadCount: 3, status: 'open' }]
  const matches = (row, scope) => Object.entries(scope).every(([key, value]) => row[key] === value)
  const writes = [], sent = []
  const dto = load('server/mobile/conversations.js', {})
  const { telegramConversations: run } = load('server/mobile/telegramConversations.js', {
    '@models/TelegramConversations': {
      find: scope => query(rows.filter(row => matches(row, scope))),
      findOne: scope => query(rows.find(row => matches(row, scope))),
      findOneAndUpdate: (scope, update) => { writes.push(scope); const row = rows.find(row => matches(row, scope)); if (row) Object.assign(row, update.$set); return query(row) },
    },
    '@models/TelegramMessages': { find: scope => { assert.equal(scope.tenantId, a); assert.equal(scope.conversationId, id); return query([]) } },
    '@server/dbConnect': async () => {},
    '@server/integrationAccess': { requireTenantIntegrationAccess: async (_kind, request) => {
      const tenantId = request.headers.get('authorization')
      return [a, b].includes(tenantId) ? { ok: true, tenantId } : { ok: false, status: tenantId === 'expired-tariff' ? 403 : 401, error: 'denied' }
    } },
    '@server/telegramBusiness': { isTelegramReplyWindowOpen: date => Boolean(date) },
    '@server/telegramConversationReply': { sendTelegramConversationReply: async scope => { sent.push(scope); return { _id: id, text: scope.text, direction: 'outgoing', status: 'sent' } } },
    './routeHelpers': reply, './conversations': dto,
  })
  assert.deepEqual((await run(req())).data.map(row => row._id), [id])
  assert.deepEqual((await run(req(b))).data.map(row => row._id), [foreignId])
  assert.equal((await run(req('revoked'))).status, 401)
  assert.equal((await run(req('expired-tariff'))).status, 403)
  for (const action of ['history', 'patch', 'send']) assert.equal((await run(req(a, { text: 'x', markRead: true }), { id: foreignId, action })).status, 404)
  assert.equal((await run(req(a, undefined, '?clientId[$ne]=x&clientId=wrong'))).status, 400)
  assert.equal((await run(req(a, { tenantId: b, markRead: true }), { id, action: 'patch' })).status, 400)
  assert.equal(writes.length, 0); assert.equal(sent.length, 0)
  assert.equal((await run(req(a, { markRead: true }), { id, action: 'patch' })).data.unreadCount, 0)
  assert.deepEqual(writes[0], { tenantId: a, _id: id })
  assert.equal((await run(req(a, { text: '  Ответ  ' }), { id, action: 'send' })).status, 201)
  assert.deepEqual(sent[0], { tenantId: a, conversationId: id, text: 'Ответ' })
  assert.deepEqual((await run(req(), { id, action: 'history' })).data.messages, [])
})

test('shared Telegram reply checks ownership, window and rights before calling the provider', async () => {
  await loadBindings()
  let window = true, canReply = true, saved = true, sends = 0
  const { sendTelegramConversationReply: run } = load('server/telegramConversationReply.js', {
    '@models/TelegramConversations': { findOne: async scope => scope.tenantId === a && scope._id === id && (!scope.clientId || scope.clientId === a) ? { lastIncomingAt: new Date(), telegramChatId: 'chat' } : null },
    '@models/SiteSettings': { findOne: scope => { assert.equal(scope.tenantId, a); return query({ custom: {} }) } },
    '@server/telegramBusiness': {
      normalizeTelegramSettings: () => ({ enabled: true, botToken: 'synthetic-secret', businessConnectionId: 'connection', rights: { can_reply: canReply } }),
      isTelegramReplyWindowOpen: () => window,
      sendTelegramBusinessMessage: async () => { sends += 1; return {} },
      saveTelegramBusinessMessage: async () => saved ? { message: { _id: id, status: 'sent' } } : null,
    },
  })
  const payload = { tenantId: a, conversationId: id, clientId: a, text: 'Ответ' }
  await assert.rejects(run({ ...payload, tenantId: b }), { status: 404 })
  await assert.rejects(run({ ...payload, clientId: b }), { status: 404 })
  window = false; await assert.rejects(run(payload), { code: 'reply_window_closed' })
  window = true; canReply = false; await assert.rejects(run(payload), { code: 'reply_not_allowed' })
  assert.equal(sends, 0)
  canReply = true; assert.equal((await run(payload))._id, id)
  saved = false; await assert.rejects(run(payload), { status: 502, code: 'save_unconfirmed' })
  assert.equal(sends, 2)
})

test('Telegram settings do not expose secrets; foreign payload and tariff cannot change configuration', async () => {
  await loadBindings()
  const updates = [], delegated = []
  const mocks = {
    '@models/SiteSettings': { findOne: scope => { assert.equal(scope.tenantId, a); return query({ custom: { botToken: 'synthetic-secret' } }) } },
    '@server/dbConnect': async () => {},
    '@server/getRequestContext': async request => request.headers.get('authorization') === 'revoked' ? {} : { tenantId: a, user: { _id: a } },
    '@server/getUserTariffAccess': async () => ({}),
    '@server/integrationAccess': { hasIntegrationAccess: () => false },
    '@server/telegramBusiness': { normalizeTelegramSettings: () => ({ enabled: true, botToken: 'synthetic-secret', webhookSecret: 'private', status: 'connected', pushAudience: 'all' }), updateTelegramCustom: async value => updates.push(value) },
    '@helpers/telegramPushAudience.mjs': { isTelegramPushAudience: value => ['all', 'clients', 'non_clients'].includes(value) },
    '@server/mobile/routeHelpers': reply,
  }
  for (const action of ['connect', 'status', 'disconnect']) mocks[`../../../../integrations/telegram/${action}/route`] = { POST: async () => { delegated.push(action); return { ok: true } } }
  const route = load('app/api/mobile/v1/integrations/telegram/route.js', mocks)
  const status = await route.GET(req())
  assert.equal(status.data.available, false); assert.equal(status.data.configured, true)
  assert.ok(!JSON.stringify(status).includes('synthetic-secret')); assert.ok(!JSON.stringify(status).includes('private'))
  assert.equal((await route.GET(req('revoked'))).status, 401)
  assert.equal((await route.POST(req(a, { action: 'settings', tenantId: b, autoCreateClients: true, pushAudience: 'all' }))).status, 400)
  assert.equal((await route.POST(req(a, { action: 'settings', autoCreateClients: true, pushAudience: 'all' }))).status, 403)
  assert.equal(updates.length, 0)
  assert.equal((await route.POST(req(a, { action: 'disconnect' }))).status, 200)
  assert.deepEqual(delegated, ['disconnect'])
  mocks['@server/integrationAccess'].hasIntegrationAccess = () => true
  assert.equal((await route.POST(req(a, { action: 'settings', autoCreateClients: true, pushAudience: 'clients' }))).status, 200)
  assert.deepEqual(updates[0], { tenantId: a, patch: { telegramBusinessAutoCreateClients: true, telegramBusinessPushAudience: 'clients' } })
})
