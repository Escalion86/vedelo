import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatAiIncludedRubles,
  getAiFeatureLabel,
  getAiIncludedRubPerMonth,
  getTariffFeatureLabels,
} from './tariffFeatures.js'

// В ru-RU разделитель разрядов — неразрывный пробел; для читаемости сравнений приводим его к обычному.
const plainSpaces = (value) => value.replace(/\u00A0/g, ' ')

test('getAiIncludedRubPerMonth: 0 и мусор не считаются включённым лимитом', () => {
  assert.equal(getAiIncludedRubPerMonth({}), 0)
  assert.equal(getAiIncludedRubPerMonth({ aiIncludedRubPerMonth: 0 }), 0)
  assert.equal(getAiIncludedRubPerMonth({ aiIncludedRubPerMonth: -100 }), 0)
  assert.equal(getAiIncludedRubPerMonth({ aiIncludedRubPerMonth: 'abc' }), 0)
})

test('getAiIncludedRubPerMonth: положительный лимит читается и округляется до копеек', () => {
  assert.equal(getAiIncludedRubPerMonth({ aiIncludedRubPerMonth: 500 }), 500)
  assert.equal(
    getAiIncludedRubPerMonth({ aiIncludedRubPerMonth: 499.994 }),
    499.99
  )
  assert.equal(getAiIncludedRubPerMonth({ aiIncludedRubPerMonth: '750' }), 750)
})

test('formatAiIncludedRubles: рубли с русским разделителем разрядов', () => {
  assert.equal(formatAiIncludedRubles(500), '500 ₽')
  assert.equal(plainSpaces(formatAiIncludedRubles(1500)), '1 500 ₽')
  assert.equal(formatAiIncludedRubles(0), '0 ₽')
})

test('getAiFeatureLabel: без лимита подпись не меняется', () => {
  assert.equal(
    getAiFeatureLabel({ allowAi: true }, 'ИИ-возможности'),
    'ИИ-возможности'
  )
  assert.equal(
    getAiFeatureLabel({ allowAi: true, aiIncludedRubPerMonth: 0 }, 'ИИ-возможности'),
    'ИИ-возможности'
  )
})

test('getAiFeatureLabel: с лимитом подпись сообщает включённую сумму', () => {
  assert.equal(
    getAiFeatureLabel(
      { allowAi: true, aiIncludedRubPerMonth: 500 },
      'ИИ-возможности'
    ),
    'ИИ-возможности (включено до 500 ₽ в месяц)'
  )
  assert.equal(
    plainSpaces(getAiFeatureLabel({ allowAi: true, aiIncludedRubPerMonth: 1000 })),
    'ИИ-функции (включено до 1 000 ₽ в месяц)'
  )
})

test('getTariffFeatureLabels: подпись ИИ идёт вместе с остальными возможностями', () => {
  const labels = getTariffFeatureLabels({
    allowAi: true,
    aiIncludedRubPerMonth: 300,
    allowCalendarSync: true,
    eventsPerMonth: 50,
  })
  assert.deepEqual(labels, [
    'До 50 заказов в месяц',
    'Синхронизация с Google Calendar',
    'ИИ-функции (включено до 300 ₽ в месяц)',
  ])
})

test('getTariffFeatureLabels: тариф без ИИ не показывает лимит ИИ', () => {
  const labels = getTariffFeatureLabels({
    allowAi: false,
    aiIncludedRubPerMonth: 300,
  })
  assert.deepEqual(labels, [])
})
