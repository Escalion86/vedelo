const assert = require('node:assert/strict')
const test = require('node:test')
const { createLoader } = require('./loadWithAliases.cjs')

const user = { _id: 'owner-a', role: 'dev' }

async function loadRoute({ context = { tenantId: user._id, user }, settings, access = true } = {}) {
  const { load } = await createLoader({
    '@server/localAiAccess': { getLocalAiDeveloperContext: async () => context },
    '@server/aiSettings': {
      getTenantAiSettings: async (tenantId, options) => {
        assert.equal(tenantId, user._id)
        assert.equal(options.user, user)
        return { isDeveloper: true, localAiEnabled: true, ...settings }
      },
    },
    '@server/getUserTariffAccess': async (id) => {
      assert.equal(id, user._id)
      return { allowAi: access }
    },
  })
  const { POST } = load('app/api/events/voice-card/route.js')
  return (body) => POST(new Request('http://vedelo.test/api/events/voice-card', { method: 'POST', body }))
}

test('голосовая карточка закрыта для другого tenant, при выключенном локальном ИИ и без тарифа', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected fetch') })
  for (const options of [
    { context: { status: 403, error: 'Доступно только разработчику' } },
    { settings: { localAiEnabled: false } },
    { settings: { aiIntegrationEnabled: false } },
    { access: false },
  ]) {
    assert.equal((await (await loadRoute(options))(new FormData())).status, 403)
  }
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('голосовая карточка передаёт только аудио и дату, пропущенные поля возвращает как null', async (t) => {
  const settings = { localAiVoiceCardUrl: 'http://127.0.0.1:18012', localAiKey: 'synthetic' }
  const post = await loadRoute({ settings })
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({
    usluga: 'Ведение', gostey: 0, confidence: 0.5, extra: 'ignored',
  }))

  const body = new FormData()
  body.set('audio', new Blob(['synthetic-audio'], { type: 'audio/webm' }), 'recording.webm')
  body.set('today', '2026-11-25')
  body.set('tenantId', 'foreign')
  const response = await post(body)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    success: true,
    provider: 'local',
    fields: {
      usluga: 'Ведение', data: null, vremya: null, gorod: null, mesto: null, gostey: 0,
      byudzhet: null, telefon: null, imya: null, zhelaniya: null, confidence: 0.5,
    },
  })

  assert.equal(fetchMock.mock.callCount(), 1)
  const [url, options] = fetchMock.mock.calls[0].arguments
  assert.equal(url, 'http://127.0.0.1:18012/voice-card')
  assert.equal(options.method, 'POST')
  assert.equal(options.redirect, 'error')
  assert.equal(options.headers.Authorization, 'Bearer synthetic')
  assert.deepEqual([...options.body.keys()], ['audio', 'today'])
  assert.equal(options.body.get('audio').name, 'recording.webm')
  assert.equal(await options.body.get('audio').text(), 'synthetic-audio')
  assert.equal(options.body.get('today'), '2026-11-25')
})

test('голосовая карточка отклоняет некорректный ввод и безопасно сообщает о сбое узла', async (t) => {
  const body = new FormData()
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('private upstream details') })
  const post = await loadRoute({ settings: { localAiVoiceCardUrl: 'http://127.0.0.1:18012' } })
  assert.equal((await post(body)).status, 400)

  body.set('audio', new Blob(['synthetic-audio']), 'recording.webm')
  const remote = await loadRoute({ settings: { localAiVoiceCardUrl: 'https://example.test' } })
  assert.equal((await remote(body)).status, 400)
  assert.equal(fetchMock.mock.callCount(), 0)

  const response = await post(body)
  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { success: false, error: 'Сервис голосовой карточки недоступен' })
  assert.equal(fetchMock.mock.callCount(), 1)
})
