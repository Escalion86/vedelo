import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PRIMARY_WEB_BILLING_PROVIDER,
  getVisibleWebBillingProviders,
} from './billingProviders.mjs'

test('обычному web-пользователю доступна только Точка', () => {
  assert.deepEqual(
    getVisibleWebBillingProviders().map((provider) => provider.id),
    ['tochka']
  )
  assert.equal(PRIMARY_WEB_BILLING_PROVIDER.id, 'tochka')
})

test('разработчик видит Точку и ЮKassa', () => {
  assert.deepEqual(
    getVisibleWebBillingProviders({ isDeveloper: true }).map(
      (provider) => provider.id
    ),
    ['tochka', 'yookassa']
  )
})
