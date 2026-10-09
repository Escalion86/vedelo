import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createLoader } = require('../tests/server/loadWithAliases.cjs')

const { load } = await createLoader({
  // Соединение в этом файле не нужно: проверяются чистые функции расчёта лимита.
  '@server/dbConnect': { __esModule: true, default: async () => ({}) },
})

const {
  buildAiIncludedState,
  getAiBalanceErrorMessage,
  getAiLimitMonthStart,
  getTariffAiIncludedLimitRub,
} = load('server/aiBilling.js')

test('buildAiIncludedState: без лимита тариф ничего не покрывает', () => {
  assert.deepEqual(buildAiIncludedState({}), {
    enabled: false,
    includedRub: 0,
    usedRub: 0,
    remainingRub: 0,
    coveredByTariff: false,
  })
})

test('buildAiIncludedState: неизрасходованный лимит покрывает запросы', () => {
  const state = buildAiIncludedState({
    includedRub: 500,
    usedMicrorubles: 125_000_000,
  })
  assert.equal(state.enabled, true)
  assert.equal(state.includedRub, 500)
  assert.equal(state.usedRub, 125)
  assert.equal(state.remainingRub, 375)
  assert.equal(state.coveredByTariff, true)
})

test('buildAiIncludedState: исчерпанный и перерасходованный лимит не покрывает', () => {
  const exact = buildAiIncludedState({
    includedRub: 500,
    usedMicrorubles: 500_000_000,
  })
  assert.equal(exact.remainingRub, 0)
  assert.equal(exact.coveredByTariff, false)

  const over = buildAiIncludedState({
    includedRub: 500,
    usedMicrorubles: 700_000_000,
  })
  assert.equal(over.usedRub, 700)
  assert.equal(over.remainingRub, 0)
  assert.equal(over.coveredByTariff, false)
})

test('buildAiIncludedState: копейки не теряются при округлении', () => {
  const state = buildAiIncludedState({
    includedRub: 0.5,
    usedMicrorubles: 333_333,
  })
  assert.equal(state.usedRub, 0.33)
  assert.equal(state.remainingRub, 0.17)
})

test('getTariffAiIncludedLimitRub: пустое и мусорное значение считается нулём', () => {
  assert.equal(getTariffAiIncludedLimitRub(null), 0)
  assert.equal(getTariffAiIncludedLimitRub({}), 0)
  assert.equal(getTariffAiIncludedLimitRub({ aiIncludedRubPerMonth: 0 }), 0)
  assert.equal(getTariffAiIncludedLimitRub({ aiIncludedRubPerMonth: -50 }), 0)
  assert.equal(getTariffAiIncludedLimitRub({ aiIncludedRubPerMonth: 'abc' }), 0)
})

test('getTariffAiIncludedLimitRub: сумма читается и округляется до копеек', () => {
  assert.equal(getTariffAiIncludedLimitRub({ aiIncludedRubPerMonth: 500 }), 500)
  assert.equal(getTariffAiIncludedLimitRub({ aiIncludedRubPerMonth: '750' }), 750)
  assert.equal(
    getTariffAiIncludedLimitRub({ aiIncludedRubPerMonth: 499.994 }),
    499.99
  )
})

test('getAiLimitMonthStart: начало календарного месяца', () => {
  const start = getAiLimitMonthStart(new Date(2026, 9, 9, 23, 51, 30))
  assert.equal(start.getFullYear(), 2026)
  assert.equal(start.getMonth(), 9)
  assert.equal(start.getDate(), 1)
  assert.equal(start.getHours(), 0)
  assert.equal(start.getMinutes(), 0)
})

test('getAiBalanceErrorMessage: исчерпанный лимит тарифа упоминается в отказе', () => {
  const withLimit = getAiBalanceErrorMessage({
    requiredBalanceRub: 1.5,
    tariffLimitExhausted: true,
  })
  assert.match(withLimit, /1\.50/)
  assert.match(withLimit, /Лимит ИИ, включённый в тариф/)

  const withoutLimit = getAiBalanceErrorMessage({ requiredBalanceRub: 1.5 })
  assert.doesNotMatch(withoutLimit, /Лимит ИИ, включённый в тариф/)
})
