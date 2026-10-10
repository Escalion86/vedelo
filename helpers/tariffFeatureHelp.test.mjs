import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TARIFF_FEATURE_HELP,
  formatAiIncludedRowLabel,
  getTariffFeatureHelp,
} from './tariffFeatureHelp.js'

// Ключи строк тарифной сетки, для которых подсказка обязана существовать.
const ROW_KEYS = [
  'eventsLimit',
  'allowCalendarSync',
  'allowStatistics',
  'allowDocuments',
  'allowClientReviews',
  'allowProposals',
  'allowTelephony',
  'allowAi',
  'allowAvitoIntegration',
  'allowVkIntegration',
  'allowTelegramIntegration',
  'allowPublicLeadApi',
]

test('подсказки есть для всех строк тарифной сетки и не пустые', () => {
  for (const key of ROW_KEYS) {
    const text = TARIFF_FEATURE_HELP[key]
    assert.equal(typeof text, 'string', `нет подсказки для ${key}`)
    assert.ok(text.length > 30, `подсказка для ${key} слишком короткая`)
    assert.ok(!text.includes('undefined'), `подсказка для ${key} содержит undefined`)
  }
})

test('подсказка ИИ объясняет оплату в пределах суммы тарифа', () => {
  const text = getTariffFeatureHelp('allowAi', { aiIncludedRubPerMonth: 300 })
  assert.ok(text.includes('300 ₽'), text)
  assert.ok(text.includes('с баланса'), text)
  assert.ok(text.includes('расшифровк'), text)
})

test('подсказка ИИ без включённой суммы говорит про баланс', () => {
  const text = getTariffFeatureHelp('allowAi', { aiIncludedRubPerMonth: 0 })
  assert.ok(text.includes('не включён'), text)
  assert.ok(!text.includes('300 ₽'), text)
})

test('подсказки не-ИИ строк не зависят от тарифа', () => {
  const tariff = { aiIncludedRubPerMonth: 500 }
  const text = getTariffFeatureHelp('allowAvitoIntegration', tariff)
  assert.equal(text, TARIFF_FEATURE_HELP.allowAvitoIntegration)
  assert.ok(!text.includes('₽'), text)
})

test('неизвестный ключ даёт пустую подсказку', () => {
  assert.equal(getTariffFeatureHelp('allowUnknownFeature', {}), '')
})

test('подпись строки ИИ показывает включённую сумму', () => {
  // В ru-RU разряды разделяются неразрывным пробелом — сравниваем после нормализации.
  const normalize = (value) => value.replace(/[\u00a0\u202f]/g, ' ')
  assert.equal(
    normalize(formatAiIncludedRowLabel({ aiIncludedRubPerMonth: 300 })),
    'ИИ-возможности (300 ₽ включено)'
  )
  assert.equal(
    normalize(formatAiIncludedRowLabel({ aiIncludedRubPerMonth: 1500 })),
    'ИИ-возможности (1 500 ₽ включено)'
  )
  assert.equal(formatAiIncludedRowLabel({ aiIncludedRubPerMonth: 0 }), 'ИИ-возможности')
  assert.equal(formatAiIncludedRowLabel({}), 'ИИ-возможности')
  assert.equal(
    formatAiIncludedRowLabel({ aiIncludedRubPerMonth: 'мусор' }),
    'ИИ-возможности'
  )
})
