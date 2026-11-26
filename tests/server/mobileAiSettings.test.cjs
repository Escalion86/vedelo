const assert = require('node:assert/strict')
const test = require('node:test')
const { createLoader } = require('./loadWithAliases.cjs')
const { chain } = require('./stageFLoader.cjs')

const tenantId = 'a'.repeat(24)
const owner = { _id: tenantId, role: 'dev' }
const privateSelections = {
  localAiFu02Selected: true,
  localAiAnalysisSelected: true,
  localAiTranscriptionSelected: true,
}

async function fixture({ user = owner, storedOwner = owner, allowed = true } = {}) {
  const custom = {
    ...privateSelections,
    localAiModel: 'test-model',
    localAiTranscriptionUrl: 'http://127.0.0.1:18011/v1/audio/transcriptions',
    aiAnalysisProvider: 'artistcrm',
    aiTranscriptionProvider: 'artistcrm',
    aiIntegrationEnabled: true,
  }
  const writes = []
  const { load } = await createLoader({
    'next/server': { NextResponse: Response },
    '@server/dbConnect': async () => {},
    '@server/getRequestContext': async () => ({ tenantId, user }),
    '@server/getUserTariffAccess': async () => ({}),
    '@server/integrationAccess': { hasIntegrationAccess: () => allowed },
    '@server/avito': {},
    '@server/vkGroup': {},
    '@server/publicLeadService': {},
    '@models/Users': {
      findById(id) {
        assert.equal(id, tenantId)
        return chain(storedOwner)
      },
    },
    '@models/SiteSettings': {
      findOne(filter) {
        assert.deepEqual(filter, { tenantId })
        return chain({ custom: { ...custom } })
      },
      async findOneAndUpdate(filter, { $set }) {
        assert.deepEqual(filter, { tenantId })
        assert.equal($set.tenantId, tenantId)
        writes.push($set)
        for (const [key, value] of Object.entries($set)) {
          if (key.startsWith('custom.')) custom[key.slice('custom.'.length)] = value
        }
      },
    },
    '../../../../integrations/avito/connect/route': {},
    '../../../../integrations/avito/status/route': {},
    '../../../../integrations/vk/connect/route': {},
    '../../../../integrations/vk/status/route': {},
  })
  const route = load('app/api/mobile/v1/integrations/[provider]/route.js')
  const request = (method, body) => route[method](new Request('http://vedelo.test/api/mobile/v1/integrations/ai', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { params: Promise.resolve({ provider: 'ai' }) })
  return { request, custom, writes }
}

test('владелец dev переключается на облако одной записью и сохраняет настройки локальных узлов', async (t) => {
  const previousKey = process.env.AITUNNEL_KEY
  process.env.AITUNNEL_KEY = 'fixture-platform-key'
  t.after(() => {
    if (previousKey === undefined) delete process.env.AITUNNEL_KEY
    else process.env.AITUNNEL_KEY = previousKey
  })

  for (const body of [{ provider: 'artistcrm' }, { provider: 'aitunnel', key: 'fixture-tenant-key' }]) {
    const { request, custom, writes } = await fixture()
    const response = await request('POST', body)
    assert.equal(response.status, 200)
    const { data } = await response.json()
    assert.equal(data.analysisProvider, body.provider)
    assert.equal(data.transcriptionProvider, body.provider)
    assert.equal(data.configured, true)
    assert.equal(writes.length, 1)
    for (const key of Object.keys(privateSelections)) {
      assert.equal(writes[0][`custom.${key}`], false)
      assert.equal(Object.hasOwn(data, key), false)
    }
    assert.equal(custom.localAiModel, 'test-model')
    assert.equal(custom.localAiTranscriptionUrl, 'http://127.0.0.1:18011/v1/audio/transcriptions')
  }
})

test('сотрудник пространства, impersonation и изменённая роль владельца не сбрасывают закрытый выбор STT', async () => {
  for (const options of [
    { user: { _id: 'b'.repeat(24), role: 'dev' } },
    { user: { ...owner, impersonation: { active: true } } },
    { storedOwner: { ...owner, role: 'user' } },
  ]) {
    const { request, custom, writes } = await fixture(options)
    const response = await request('POST', {
      provider: 'aitunnel', key: 'fixture-tenant-key', localAiFu02Selected: false,
    })
    assert.equal(response.status, 200)
    assert.equal(writes.length, 1)
    for (const key of Object.keys(privateSelections)) {
      assert.equal(Object.hasOwn(writes[0], `custom.${key}`), false)
      assert.equal(custom[key], true)
    }
  }
})

test('без доступа по тарифу или настроенного ключа нельзя переключить распознавание на облако', async (t) => {
  const previousKey = process.env.AITUNNEL_KEY
  delete process.env.AITUNNEL_KEY
  t.after(() => {
    if (previousKey !== undefined) process.env.AITUNNEL_KEY = previousKey
  })

  const denied = await fixture({ allowed: false })
  assert.equal((await denied.request('POST', { provider: 'aitunnel', key: 'fixture-tenant-key' })).status, 403)
  assert.equal(denied.writes.length, 0)

  const unconfigured = await fixture()
  const { data } = await (await unconfigured.request('POST', { provider: 'artistcrm' })).json()
  assert.equal(data.configured, false)
  for (const key of Object.keys(privateSelections)) {
    assert.equal(unconfigured.custom[key], true)
    assert.equal(Object.hasOwn(unconfigured.writes[0], `custom.${key}`), false)
  }
})

test('пауза и настройка облачной модели из Android сохраняют закрытый выбор STT', async () => {
  const { request, custom, writes } = await fixture()
  custom.aitunnelKey = 'fixture-tenant-key'
  custom.aiAnalysisProvider = 'aitunnel'
  custom.aiTranscriptionProvider = 'aitunnel'

  for (const body of [{ enabled: false }, { enabled: true }, { transcriptionModel: 'new-model' }]) {
    assert.equal((await request('PATCH', { provider: 'aitunnel', ...body })).status, 200)
  }
  const { data } = await (await request('GET')).json()
  assert.equal(data.analysisProvider, 'aitunnel')
  assert.equal(data.transcriptionProvider, 'aitunnel')
  assert.equal(data.transcriptionModel, 'new-model')
  assert.equal(data.enabled, true)
  for (const key of Object.keys(privateSelections)) {
    assert.equal(custom[key], true)
    assert.equal(Object.hasOwn(data, key), false)
    assert.ok(writes.every(write => !Object.hasOwn(write, `custom.${key}`)))
  }
})
