const assert = require('node:assert/strict')
const fs = require('node:fs')
const sharp = require('sharp')
const { loadBindings, transformSync } = require('next/dist/build/swc')

async function harness(options = {}) {
  await loadBindings()
  const hints = await import('../../helpers/aiEventDraftHints.mjs')
  const contacts = await import('../../helpers/aiEventDraftContacts.mjs')
  const calls = { provider: [], queries: [], clients: [] }
  const query = (rows) => ({ select() { return this }, sort() { return this }, lean: async () => rows })
  const models = {
    Clients: { find(filter) { calls.queries.push(filter); assert.equal(filter.tenantId, 'tenant-a'); return query([{ _id: 'a', firstName: 'Анна' }]) }, create: async (value) => { calls.clients.push(value); return { ...value, _id: 'new' } } },
    Services: { find(filter) { calls.queries.push(filter); assert.equal(filter.tenantId, 'tenant-a'); return query([{ _id: 'service-a', title: 'Шоу' }]) } },
    SiteSettings: { findOne(filter) { assert.equal(filter.tenantId, 'tenant-a'); return query({ timeZone: 'Asia/Krasnoyarsk' }) } },
  }
  const settings = { tenantId: 'tenant-a', userId: 'owner', aiAnalysisProvider: options.provider || 'artistcrm', aiAnalysisModel: options.model || 'gpt-4o-mini' }
  const mocks = {
    'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } }, sharp,
    '@server/dbConnect': async () => {},
    '@server/getTenantContext': async () => options.unauthorized ? {} : { tenantId: 'tenant-a', user: { role: options.role === undefined ? 'dev' : options.role, _id: 'user-a' } },
    '@server/mobile/auth': { getMobileUser: async req => req.headers.get('authorization') === 'Bearer valid-test-token' ? { user: { role: options.role === undefined ? 'dev' : options.role, _id: 'user-a', tenantId: 'tenant-a' } } : { error: 'Invalid token' } },
    '@server/getRequestContext': async () => options.unauthorized ? {} : { tenantId: 'tenant-a', user: { role: options.role === undefined ? 'dev' : options.role, _id: 'user-a' } },
    '@server/getUserTariffAccess': async () => ({ allowAi: !options.denied }),
    '@server/aiSettings': { getTenantAiSettings: async (tenant) => { assert.equal(tenant, 'tenant-a'); return settings } },
    '@server/aiChatCompletion': {
      getAiAnalysisProviderConfig: (s) => ({ name: s.aiAnalysisProvider, model: s.aiAnalysisModel, apiKey: options.disabled ? '' : 'mock-key' }),
      isAiVisionProvider: p => ['artistcrm', 'aitunnel', 'openai'].includes(p.name) && p.model === 'gpt-4o-mini',
      requestAiChatCompletion: async (value) => {
        calls.provider.push(value)
        assert.equal(value.settings.tenantId, 'tenant-a')
        assert.equal(value.settings.userId, 'user-a')
        if (options.failure === value.feature) throw new Error('private-photo-and-provider-key')
        if (options.balance === value.feature) throw Object.assign(new Error('balance'), { code: 'AI_BALANCE' })
        if (value.feature === 'event_photo_ocr') return { content: JSON.stringify({ text: options.empty ? '' : options.text || 'Клиент Анна. Шоу 15 октября, гонорар 50000 рублей.' }) }
        if (options.invalidJson) return { content: 'bad JSON' }
        return { content: JSON.stringify({ eventType: 'Шоу', contractSum: 50000, clientId: options.noClient ? null : options.foreign ? 'foreign-b' : 'a', servicesIds: ['foreign-service-b', 'service-a'] }) }
      },
    },
    '@server/aiBilling': { isAiBalanceError: e => e.code === 'AI_BALANCE', getAiBalanceErrorMessage: () => 'Недостаточно средств' },
    '@helpers/aiEventDraftHints.mjs': hints, '@helpers/aiEventDraftContacts.mjs': contacts,
    ...Object.fromEntries(Object.entries(models).map(([name, model]) => [`@models/${name}`, model])),
  }
  function load(file) {
    const { code } = transformSync(fs.readFileSync(file, 'utf8'), { filename: file, jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' } })
    const loaded = { exports: {} }
    new Function('require', 'module', 'exports', code)(name => {
      if (name in mocks) return mocks[name]
      if (name.startsWith('@server/')) return load(`server/${name.slice(8)}.js`)
      throw new Error(`Unexpected dependency ${name}`)
    }, loaded, loaded.exports)
    return loaded.exports
  }
  if (options.actualContext) delete mocks['@server/getRequestContext']
  const { POST } = load('app/api/events/ai-photo-draft/route.js')
  return { POST, calls, load }
}
const png = async () => sharp({ create: { width: 64, height: 32, channels: 3, background: 'white' } }).png().toBuffer()
const imageBody = async () => ({ image: `data:image/png;base64,${(await png()).toString('base64')}`, tenantId: 'foreign-b' })
const request = (body, headers = {}) => new Request('http://localhost/api/events/ai-photo-draft', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })


module.exports = { harness, imageBody, request }
