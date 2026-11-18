const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const tenantId = 'a'.repeat(24)
const otherTenantId = 'b'.repeat(24)
const topics = 'Площадка и состав гостей'
const operationId = 'tgb-questionnaire:synthetic-session:0'
const input = { tenantId, topics, operationId }

async function fixture({ enabled = true, allowAi = true, response, fail } = {}) {
  await loadBindings()
  const filename = 'server/telegramQuestionnaireAi.js'
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' },
  })
  const tariffReads = [], settingsReads = [], completions = []
  const settings = { tenantId, userId: tenantId, aiIntegrationEnabled: enabled, aiAnalysisProvider: 'artistcrm' }
  const mocks = {
    '@server/getUserTariffAccess': async (lookupTenant) => {
      tariffReads.push(lookupTenant)
      return { allowAi, allowTelegramIntegration: true, user: { role: lookupTenant === tenantId ? 'dev' : 'user' } }
    },
    '@server/integrationAccess': {
      hasTelegramQuestionnaireAccess: (access) => access.user.role === 'dev' && access.allowTelegramIntegration,
    },
    '@server/aiSettings': {
      getTenantAiSettings: async (lookupTenant) => { settingsReads.push(lookupTenant); return settings },
    },
    '@server/aiChatCompletion': {
      requestAiChatCompletion: async (options) => {
        completions.push(options)
        if (fail) throw new Error(fail)
        return { content: response ?? '{"question":"Где находится площадка?"}' }
      },
    },
  }
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => mocks[id], mod, mod.exports)
  return { question: mod.exports.getTelegramQuestionnaireAiQuestion, tariffReads, settingsReads, completions, settings }
}

test('запрашивает один вопрос с ограниченным контекстом и учётом биллинга tenant', async () => {
  const { question, tariffReads, settingsReads, completions, settings } = await fixture()
  const answers = [{ question: 'Какая услуга?', answer: 'Видеосъёмка', internalClientId: 'hidden' }]
  const previousClarifications = [{ question: 'Сколько гостей?', answer: '30' }]
  assert.equal(await question({
    ...input, initialMessage: 'Нужна съёмка. '.repeat(100), answers, previousClarifications,
    conversation: 'Не включать переписку', client: { phone: 'hidden' },
  }), 'Где находится площадка?')
  assert.deepEqual(tariffReads, [tenantId])
  assert.deepEqual(settingsReads, [tenantId])
  assert.equal(completions.length, 1)
  const [call] = completions
  assert.equal(call.settings, settings)
  assert.equal(call.operationId, operationId)
  assert.equal(call.feature, 'event_draft')
  assert.equal(call.timeoutMs, 3_000)
  assert.equal(call.jsonResponse, true)
  assert.equal(call.tools, undefined)
  assert.deepEqual(call.messages.map(({ role }) => role), ['system', 'user'])
  assert.deepEqual(JSON.parse(call.messages[1].content), {
    topics,
    initialMessage: 'Нужна съёмка. '.repeat(100).slice(0, 800),
    answers: [{ question: 'Какая услуга?', answer: 'Видеосъёмка' }],
    previousClarifications,
  })
})

test('нет внешнего запроса без темы, ключа операции, разрешённого tenant или ИИ', async () => {
  const active = await fixture()
  assert.equal(await active.question({ ...input, topics: '  ' }), null)
  assert.equal(await active.question({ ...input, operationId: '' }), null)
  assert.deepEqual(active.tariffReads, [])
  assert.equal(await active.question({ ...input, tenantId: otherTenantId }), null)
  assert.deepEqual(active.tariffReads, [otherTenantId])
  assert.deepEqual(active.settingsReads, [])
  assert.deepEqual(active.completions, [])
  const noTariff = await fixture({ allowAi: false })
  assert.equal(await noTariff.question(input), null)
  assert.deepEqual(noTariff.settingsReads, [])
  const disabled = await fixture({ enabled: false })
  assert.equal(await disabled.question(input), null)
  assert.deepEqual(disabled.completions, [])
})

test('пропускает уточнение после отказа, таймаута или небезопасного ответа модели', async () => {
  const failed = await fixture({ fail: 'AbortError' })
  assert.equal(await failed.question(input), null)
  const responses = [
    '{"question":null}',
    'не JSON',
    '{"question":"Где находится площадка?", "price": 5000}',
    '{"question":"Где площадка? Сколько гостей?"}',
    '{"question":"Готовы оплатить 5000 рублей?"}',
    '{"question":"Стоимость составит пять тысяч, вас устраивает?"}',
    '{"question":"Я забронировал вечер, вам подходит?"}',
    '{"question":"Перейдёте на https://example.com?"}',
    '{"question":"  Сколько гостей? "}',
  ]
  for (const response of responses) {
    const ai = await fixture({ response })
    assert.equal(await ai.question({ ...input, previousClarifications: [{ question: 'Сколько гостей?', answer: '30' }] }), null, response)
  }
})
