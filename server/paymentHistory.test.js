import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPaymentHistoryFilter,
  makePaymentHistoryCursor,
  parsePaymentHistoryCursor,
  serializePaymentHistoryItem,
} from './paymentHistory.js'

const USER_ID = '66a000000000000000000001'
const TENANT_ID = '66a000000000000000000002'

test('история платежей всегда ограничена пользователем и tenant', () => {
  const filter = buildPaymentHistoryFilter({
    userId: USER_ID,
    tenantId: TENANT_ID,
    category: 'bonus',
  })

  assert.equal(filter.userId, USER_ID)
  assert.equal(filter.tenantId, TENANT_ID)
  assert.equal(filter.type, 'topup')
  assert.equal(filter.source, 'system')
  assert.notEqual(
    buildPaymentHistoryFilter({
      userId: USER_ID,
      tenantId: '66a000000000000000000099',
    }).tenantId,
    filter.tenantId
  )
})

test('cursor истории сохраняет стабильную пару createdAt и id', () => {
  const cursor = makePaymentHistoryCursor({
    _id: '66a000000000000000000010',
    createdAt: '2026-09-16T08:00:00.000Z',
  })
  const parsed = parsePaymentHistoryCursor(cursor)

  assert.equal(parsed.id, '66a000000000000000000010')
  assert.equal(parsed.createdAt.toISOString(), '2026-09-16T08:00:00.000Z')
  assert.equal(parsePaymentHistoryCursor('not-a-cursor'), null)
})

test('пользовательский payment DTO не раскрывает внутренние идентификаторы', () => {
  const item = serializePaymentHistoryItem({
    _id: '66a000000000000000000010',
    amount: 150,
    type: 'topup',
    source: 'system',
    status: 'succeeded',
    purpose: 'balance',
    paymentMethodType: 'sbp',
    paymentMethodTitle: 'СБП',
    providerPaymentId: 'provider-secret-id',
    idempotenceKey: 'internal-idempotence-key',
    rawProviderStatus: 'APPROVED',
    paymentMethodDetails: { pan: '**** 0000' },
    referralReward: {
      rewardFor: 'balance_topup',
      percent: 5,
      referralUserId: '66a000000000000000000020',
      sourcePaymentId: '66a000000000000000000021',
    },
    createdAt: '2026-09-16T08:00:00.000Z',
  })

  assert.equal(item.kind, 'referral_bonus')
  assert.equal(item.title, 'Реферальный бонус')
  assert.equal(
    item.details,
    'Бонус 5% за пополнение приглашённого пользователя.'
  )
  assert.equal(item.direction, 'in')
  assert.equal('providerPaymentId' in item, false)
  assert.equal('idempotenceKey' in item, false)
  assert.equal('paymentMethodDetails' in item, false)
  assert.equal('referralReward' in item, false)
})
