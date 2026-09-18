import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_TARIFFS,
  NO_TARIFF,
  getUserTariffBucket,
  matchesUserTariffFilter,
} from './userTariffFilter.mjs'

const knownTariffIds = new Set(['free', 'business'])

test('фильтр тарифа сопоставляет пользователя с назначенным тарифом', () => {
  const user = { tariffId: 'business' }

  assert.equal(getUserTariffBucket(user, knownTariffIds), 'business')
  assert.equal(matchesUserTariffFilter(user, 'business', knownTariffIds), true)
  assert.equal(matchesUserTariffFilter(user, 'free', knownTariffIds), false)
})

test('пользователь без тарифа попадает в отдельный фильтр', () => {
  assert.equal(getUserTariffBucket({}, knownTariffIds), NO_TARIFF)
  assert.equal(matchesUserTariffFilter({}, NO_TARIFF, knownTariffIds), true)
})

test('ссылка на удалённый тариф считается отсутствующим тарифом', () => {
  const user = { tariffId: 'deleted' }

  assert.equal(getUserTariffBucket(user, knownTariffIds), NO_TARIFF)
})

test('вариант «Все тарифы» не исключает пользователей', () => {
  assert.equal(
    matchesUserTariffFilter(
      { tariffId: 'business' },
      ALL_TARIFFS,
      knownTariffIds
    ),
    true
  )
  assert.equal(matchesUserTariffFilter({}, ALL_TARIFFS, knownTariffIds), true)
})
