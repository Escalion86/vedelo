import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findAssignedTariff,
  findVisibleFreeTariff,
  isExpiredRegistrationOffer,
} from './billingRenewalState.js'

test('назначенный скрытый тариф остаётся доступен billing cron', () => {
  const hiddenTariff = { _id: 'business', hidden: true, price: 990 }

  assert.equal(findAssignedTariff([hiddenTariff], 'business'), hiddenTariff)
  assert.equal(findVisibleFreeTariff([hiddenTariff]), null)
})

test('бесплатный fallback выбирается только среди видимых тарифов', () => {
  const hiddenFree = { _id: 'internal', hidden: true, price: 0 }
  const visibleFree = { _id: 'free', hidden: false, price: 0 }

  assert.equal(
    findVisibleFreeTariff([hiddenFree, visibleFree]),
    visibleFree
  )
})

test('завершённое регистрационное предложение очищается после срока', () => {
  const user = {
    tariffId: 'business',
    nextChargeAt: null,
    registrationOffer: {
      tariffId: 'business',
      endsAt: '2026-09-17T10:00:00.000Z',
    },
  }

  assert.equal(
    isExpiredRegistrationOffer(user, '2026-09-18T00:00:00.000Z'),
    true
  )
})

test('оплаченный или заменённый тариф не очищается вместе с пробным', () => {
  const offer = {
    tariffId: 'business',
    endsAt: '2026-09-17T10:00:00.000Z',
  }

  assert.equal(
    isExpiredRegistrationOffer(
      {
        tariffId: 'business',
        nextChargeAt: '2026-10-17T10:00:00.000Z',
        registrationOffer: offer,
      },
      '2026-09-18T00:00:00.000Z'
    ),
    false
  )
  assert.equal(
    isExpiredRegistrationOffer(
      {
        tariffId: 'free',
        nextChargeAt: null,
        registrationOffer: offer,
      },
      '2026-09-18T00:00:00.000Z'
    ),
    false
  )
})
