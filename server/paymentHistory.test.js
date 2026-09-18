import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPaymentHistoryFilter,
  canViewPaymentHistoryForUser,
  makePaymentHistoryCursor,
  parsePaymentHistoryCursor,
  serializePaymentHistoryItem,
  paymentManagementActions,
} from './paymentHistory.js'

const USER_ID = '66a000000000000000000001'
const TENANT_ID = '66a000000000000000000002'

test('историю чужих расчётов видят только developer и администратор', () => {
  assert.equal(
    canViewPaymentHistoryForUser({
      viewerUserId: USER_ID,
      viewerRole: 'user',
      targetUserId: USER_ID,
    }),
    true
  )
  assert.equal(
    canViewPaymentHistoryForUser({
      viewerUserId: USER_ID,
      viewerRole: 'user',
      targetUserId: TENANT_ID,
    }),
    false
  )
  assert.equal(
    canViewPaymentHistoryForUser({
      viewerUserId: USER_ID,
      viewerRole: 'admin',
      targetUserId: TENANT_ID,
    }),
    true
  )
  assert.equal(
    canViewPaymentHistoryForUser({
      viewerUserId: USER_ID,
      viewerRole: 'dev',
      targetUserId: TENANT_ID,
    }),
    true
  )
})

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

test('ручное списание показывает причину, историческую дату и отдельный фильтр', () => {
  const item = serializePaymentHistoryItem({
    type: 'charge',
    source: 'manual',
    purpose: 'tariff',
    amount: 199,
    comment: 'Тариф за август',
    paidAt: '2026-08-01T12:00:00Z',
    createdAt: '2026-09-17T12:00:00Z',
  })
  assert.equal(item.title, 'Списание за тариф')
  assert.equal(item.details, 'Тариф за август')
  assert.equal(item.occurredAt, '2026-08-01T12:00:00Z')
  assert.equal(item.direction, 'out')
  assert.deepEqual(
    buildPaymentHistoryFilter({
      userId: USER_ID,
      tenantId: TENANT_ID,
      category: 'charge',
    }),
    { userId: USER_ID, tenantId: TENANT_ID, type: 'charge' }
  )
})

test('списания за смену и продление тарифа без legacy purpose отображаются как тарифные', () => {
  const item = serializePaymentHistoryItem({
    type: 'charge',
    source: 'system',
    purpose: 'balance',
    tariffId: TENANT_ID,
    amount: 200,
  })
  assert.equal(item.kind, 'tariff')
  assert.equal(item.title, 'Списание за тариф')
  assert.equal('tariffId' in item, false)
  const filter = buildPaymentHistoryFilter({
    userId: USER_ID,
    tenantId: TENANT_ID,
    category: 'tariff',
  })
  assert.equal(filter.tenantId, TENANT_ID)
  assert.equal(filter.$or[1].source, 'system')
  assert.equal(filter.$or[1].type, 'charge')
})

test('удаление разрешено только завершённым ручным операциям и бонусам; банковские платежи доступны для синхронизации', () => {
  assert.equal(
    paymentManagementActions({
      type: 'charge',
      source: 'manual',
      status: 'succeeded',
    }).canDelete,
    true
  )
  assert.equal(
    paymentManagementActions({
      type: 'charge',
      source: 'system',
      status: 'succeeded',
    }).canDelete,
    false
  )
  assert.equal(
    paymentManagementActions({
      type: 'charge',
      source: 'manual',
      status: 'pending',
    }).canDelete,
    false
  )
  assert.equal(
    paymentManagementActions({
      type: 'topup',
      source: 'manual',
      purpose: 'balance',
      status: 'succeeded',
      referralRewardPending: true,
    }).canDelete,
    false
  )
  assert.deepEqual(
    paymentManagementActions({
      type: 'topup',
      source: 'tochka',
      status: 'pending',
    }),
    { canDelete: false, syncProvider: 'tochka' }
  )
})
