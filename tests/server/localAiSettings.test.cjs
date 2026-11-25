const assert = require('node:assert/strict')
const test = require('node:test')
const { createLoader } = require('./loadWithAliases.cjs')

const ownerId = 'a'.repeat(24)
const memberId = 'b'.repeat(24)
const baseUrl = 'http://127.0.0.1:18010/v1'
const secret = 'test-only-local-key'
const ownerUser = { _id: ownerId, role: 'dev' }
const requester = { user: ownerUser, tenantId: ownerId }
const savedCustom = {
  aiAnalysisProvider: 'deepseek',
  aiAnalysisModel: 'deepseek-chat',
  aiTranscriptionProvider: 'aitunnel',
  aiTranscriptionModel: 'whisper-1',
  aitunnelKey: 'cloud-key',
  eventTypes: ['Съёмка'],
}

const request = (path, method, body) => new Request(`http://vedelo.test/api/${path}`, {
  method,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
})

async function fixture({ context = requester, owner = ownerUser, initial = savedCustom, allowAi = true } = {}) {
  const doc = { _id: 'c'.repeat(24), tenantId: ownerId, syncVersion: 1, updatedAt: new Date(0), custom: { ...initial } }
  const platform = { aiBilling: { markupCoefficient: 1.5 } }
  const writes = []
  const reads = []
  const query = (value) => ({
    select: () => query(value),
    lean: async () => value && structuredClone(value),
    then: (resolve, reject) => Promise.resolve(value && structuredClone(value)).then(resolve, reject),
  })
  const { load } = await createLoader({
    '@models/SiteSettings': {
      findOne({ tenantId }) {
        reads.push(tenantId)
        assert.ok(tenantId === ownerId || tenantId === null)
        return query(tenantId ? doc : platform)
      },
      findOneAndUpdate(filter, update) {
        writes.push({ filter, update })
        assert.ok(filter.tenantId === ownerId || filter.tenantId === null)
        for (const [key, value] of Object.entries(update.$set)) {
          if (key.startsWith('custom.')) doc.custom[key.slice(7)] = value
          else if (key === 'aiBilling.markupCoefficient') platform.aiBilling.markupCoefficient = value
          else if (filter.tenantId) doc[key] = value
        }
        return query(filter.tenantId ? doc : platform)
      },
    },
    '@models/Users': {
      findById(id) {
        assert.equal(id, ownerId)
        return query(owner)
      },
    },
    '@server/aiBilling': {
      DEFAULT_AI_MARKUP_COEFFICIENT: 1.5,
      normalizeAiMarkupCoefficient: (value) => Number(value ?? 1.5),
    },
    '@server/dbConnect': async () => {},
    '@server/getRequestContext': async () => context,
    '@server/getTenantContext': async () => context,
    '@server/getUserTariffAccess': async (tenantId) => {
      assert.equal(tenantId, ownerId)
      return { allowAi }
    },
    '@server/telegramBusiness': { sanitizeTelegramSiteSettings: (settings) => settings },
    '@server/tenantTerminology': { clearTenantWorkItemTerminologyCache: () => {} },
  })
  const settings = load('app/api/ai/settings/route.js')
  const site = load('app/api/site/route.js')
  return {
    doc, reads, writes, settings, load,
    patch: (body) => settings.PATCH(request('ai/settings', 'PATCH', body)),
    probe: (body) => load('app/api/ai/local-test/route.js').POST(request('ai/local-test', 'POST', body)),
    siteGet: () => site.GET(),
    sitePost: (custom) => site.POST(request('site', 'POST', { custom })),
  }
}

test('PATCH и local-test закрыты для обычного аккаунта, impersonation, архива и сменённой роли владельца', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw Error('Нежелательный сетевой запрос') })
  for (const options of [
    { context: { ...requester, user: { ...ownerUser, role: 'user' } } },
    { context: { ...requester, user: { _id: memberId, role: 'dev' } } },
    { context: { ...requester, user: { ...ownerUser, impersonation: { active: true } } } },
    { context: { ...requester, user: { ...ownerUser, archive: true } } },
    { owner: { ...ownerUser, archive: true } },
    { owner: { ...ownerUser, role: 'user' } },
  ]) {
    const { patch, probe, writes, reads } = await fixture(options)
    const response = await patch({ aiAnalysisProvider: 'local', localAiEnabled: true })
    assert.equal(response.status, 403)
    assert.match((await response.json()).error, /владельцу с ролью разработчика/)
    assert.equal((await probe({ localAiBaseUrl: baseUrl })).status, 403)
    assert.deepEqual(writes, [])
    assert.deepEqual(reads, [])
  }
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('PATCH владельца сохраняет локальный выбор и адреса отдельно от облачных провайдеров', async () => {
  const { patch, doc, writes, load, settings } = await fixture()
  const response = await patch({
    aiAnalysisProvider: 'local',
    aiTranscriptionProvider: 'local',
    localAiEnabled: true,
    localAiBaseUrl: `${baseUrl}/`,
    localAiTranscriptionUrl: 'http://127.0.0.1:18011',
    localAiVoiceCardUrl: 'http://127.0.0.1:18012',
    localAiModel: 'Qwen',
    localAiKey: secret,
    localAiTimeoutMs: 25000,
  })
  assert.equal(response.status, 200)
  const { data } = await response.json()
  assert.equal(data.localAiEnabled, true)
  assert.equal(data.localAiBaseUrl, baseUrl)
  assert.equal(data.localAiTimeoutMs, 25000)
  assert.equal(data.aiAnalysisProvider, 'local')
  assert.equal(data.aiAnalysisFallbackProvider, 'deepseek')
  assert.equal(data.aiAnalysisModel, 'deepseek-chat')
  assert.equal(data.aiTranscriptionProvider, 'local')
  assert.equal(data.aiTranscriptionFallbackProvider, 'aitunnel')
  assert.equal(data.localAiKey, undefined)
  assert.equal(doc.custom.localAiKey, secret)
  assert.equal(doc.custom.aiAnalysisProvider, 'deepseek')
  assert.equal(doc.custom.aiTranscriptionProvider, 'aitunnel')
  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0].filter, { tenantId: ownerId })
  const { getTenantAiSettings } = load('server/aiSettings.js')
  const dev = await getTenantAiSettings(ownerId, { userId: ownerId })
  const member = await getTenantAiSettings(ownerId, { user: { _id: memberId, role: 'user' } })
  assert.equal(dev.localAiKey, secret)
  assert.equal(member.aiAnalysisProvider, 'deepseek')
  assert.equal(member.aiTranscriptionProvider, 'aitunnel')
  assert.equal(Object.keys(member).some((key) => key.startsWith('localAi')), false)
  const readResponse = await settings.GET(request('ai/settings', 'GET'))
  assert.equal(readResponse.headers.get('Cache-Control'), 'no-store')
  const read = await readResponse.json()
  assert.equal(read.data.localAiBaseUrl, baseUrl)
  assert.equal(read.data.localAiKey, undefined)
})

test('PATCH отклоняет адреса вне loopback, неподходящий таймаут и чужой tenant', async () => {
  const { patch, writes } = await fixture()
  for (const body of [
    { localAiBaseUrl: 'http://user:password@127.0.0.1:18010/v1' },
    { localAiBaseUrl: 'https://example.test' },
    { localAiTranscriptionUrl: 'ftp://127.0.0.1:18011' },
    { localAiVoiceCardUrl: 'http://127.0.0.1:18012?secret=x' },
    ...[999, 1000.5, 120001, true].map((localAiTimeoutMs) => ({ localAiTimeoutMs })),
    { localAiEnabled: 'true' },
    { tenantId: memberId, localAiBaseUrl: baseUrl },
  ]) {
    assert.equal((await patch(body)).status, 400)
  }
  assert.deepEqual(writes, [])
})

test('PATCH переключает анализ на облако атомарно и учитывает тариф', async () => {
  const initial = { ...savedCustom, localAiAnalysisSelected: true, localAiEnabled: true }
  const change = {
    localAiEnabled: false,
    aiAnalysisProvider: 'aitunnel',
    aiAnalysisModel: 'gpt-4o-mini',
    aiTranscriptionProvider: 'aitunnel',
    aiTranscriptionModel: 'whisper-1',
    aitunnelEnabled: true,
  }
  const allowed = await fixture({ initial })
  const response = await allowed.patch(change)
  assert.equal(response.status, 200)
  const { data } = await response.json()
  assert.equal(data.aiAnalysisProvider, 'aitunnel')
  assert.equal(data.aiAnalysisModel, 'gpt-4o-mini')
  assert.equal(data.localAiEnabled, false)
  assert.equal(allowed.doc.custom.localAiAnalysisSelected, false)
  assert.equal(allowed.writes.length, 1)
  assert.deepEqual(allowed.writes[0].filter, { tenantId: ownerId, updatedAt: new Date(0) })
  const denied = await fixture({ initial, allowAi: false })
  assert.equal((await denied.patch(change)).status, 403)
  assert.deepEqual(denied.writes, [])
})

test('local-test проверяет /models без редиректа и возвращает ошибку недоступного сервиса без 500', async (t) => {
  const { probe } = await fixture({
    initial: { ...savedCustom, localAiBaseUrl: baseUrl, localAiKey: secret },
  })
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw TypeError('fetch failed') })
  const unavailable = await probe()
  assert.equal(unavailable.status, 200)
  assert.deepEqual(await unavailable.json(), { success: false, error: 'fetch failed' })
  assert.equal((await probe({ localAiBaseUrl: 'http://localhost:18010/v1' })).status, 400)

  fetchMock.mock.mockImplementation(async () => Response.json({
    data: [{ id: 'model-1' }, { id: 'model-2' }],
  }))
  const response = await probe({ localAiBaseUrl: `${baseUrl}/chat/completions`, localAiModel: 'model-2' })
  assert.equal(response.status, 200)
  const { success, model, latencyMs } = await response.json()
  assert.equal(success, true)
  assert.equal(model, 'model-2')
  assert.equal(Number.isInteger(latencyMs) && latencyMs >= 0, true)
  assert.equal(fetchMock.mock.callCount(), 2)
  const [url, options] = fetchMock.mock.calls[1].arguments
  assert.equal(url, `${baseUrl}/models`)
  assert.equal(options.redirect, 'error')
  assert.equal(options.method, 'GET')
  assert.ok(options.signal instanceof AbortSignal)
  assert.equal(options.headers.Authorization, `Bearer ${secret}`)
})

test('общие настройки удаляют localAi* из ответа, блокируют прямую запись и сохраняют закрытые поля в БД', async () => {
  const { siteGet, sitePost, doc, writes, load } = await fixture({
    context: { ...requester, user: { _id: memberId, role: 'user' } },
    initial: { ...savedCustom, localAiAnalysisSelected: true, localAiBaseUrl: baseUrl, localAiKey: secret },
  })
  const before = await (await siteGet()).json()
  assert.equal(before.data.custom.aiAnalysisProvider, 'deepseek')
  assert.equal(Object.keys(before.data.custom).some((key) => key.startsWith('localAi')), false)
  for (const custom of [
    { aiAnalysisProvider: 'local' },
    { aiTranscriptionProvider: ' LOCAL ' },
    { 'localAiEnabled.enabled': true },
    { localAiKey: 'changed' },
  ]) {
    assert.equal((await sitePost(custom)).status, 403)
  }
  assert.deepEqual(writes, [])
  const updated = await (await sitePost({ eventTypes: ['Ведущий'] })).json()
  assert.equal(updated.success, true)
  assert.deepEqual(updated.data.custom.eventTypes, ['Ведущий'])
  assert.equal(updated.data.custom.localAiBaseUrl, undefined)
  assert.equal(doc.custom.localAiKey, secret)
  assert.equal(doc.custom.localAiBaseUrl, baseUrl)
  assert.equal(doc.custom.localAiAnalysisSelected, true)
  const { sanitizeMobileSettings } = load('server/mobile/settings.js')
  assert.deepEqual(sanitizeMobileSettings(doc).custom.eventTypes, ['Ведущий'])
  assert.equal(JSON.stringify(sanitizeMobileSettings(doc)).includes('localAi'), false)
  const { sanitizeLocalAiSiteSettings } = load('helpers/siteSettingsCustom.mjs')
  assert.deepEqual(
    sanitizeLocalAiSiteSettings({ custom: new Map(Object.entries(doc.custom)) }).custom,
    { ...savedCustom, eventTypes: ['Ведущий'] }
  )
})

test('обновления Telegram, Avito и VK сохраняют другие настройки и очищают поля прежними значениями', async () => {
  const { load } = await createLoader({
    '@models/SiteSettings': {
      findOneAndUpdate(filter, update) {
        assert.deepEqual(filter, { tenantId: ownerId })
        assert.equal(Object.hasOwn(update.$set, 'custom'), false)
        return { lean: async () => update.$set }
      },
    },
    '@models/Clients': {},
    '@models/Events': {},
    '@models/AvitoConversations': {},
    '@models/AvitoMessages': {},
    '@models/VkConversations': {},
    '@models/VkMessages': {},
    '@models/TelegramConversations': {},
    '@models/TelegramMessages': {},
    '@server/publicLeadService': {},
    '@server/messengerPush': {},
  })
  for (const [file, method, field, value] of [
    ['avito', 'updateAvitoCustom', 'avitoWebhookId', ''],
    ['vkGroup', 'updateVkCustom', 'vkGroupWebhookSecret', ''],
    ['telegramBusiness', 'updateTelegramCustom', 'telegramBusinessRights', null],
  ]) {
    const store = load(`server/${file}.js`)[method]
    const update = await store({ tenantId: ownerId, patch: { [field]: value } })
    assert.deepEqual(update, { tenantId: ownerId, [`custom.${field}`]: value })
  }
})
