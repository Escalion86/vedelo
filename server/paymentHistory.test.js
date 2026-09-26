import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPaymentHistoryFilter,
  canViewPaymentHistoryForUser,
  makePaymentHistoryCursor,
  parsePaymentHistoryCursor,
  parsePaymentHistoryLimit,
  serializePaymentHistoryItem,
  paymentManagementActions,
  buildPaymentReceiptFilter,
  buildReceiptablePaymentFilter,
  buildMissingPaymentReceiptFilter,
  canAttachPaymentReceipt,
  normalizePaymentReceiptUrl,
} from './paymentHistory.js'

const USER_ID = '66a000000000000000000001'
const TENANT_ID = '66a000000000000000000002'

test('история платежей использует 30 записей без limit и ограничивает явный limit', () => {
  for (const value of [null, undefined, '', ' ', 'invalid']) {
    assert.equal(parsePaymentHistoryLimit(value), 30)
  }
  assert.equal(parsePaymentHistoryLimit('0'), 1)
  assert.equal(parsePaymentHistoryLimit('-10'), 1)
  assert.equal(parsePaymentHistoryLimit('12.5'), 12)
  assert.equal(parsePaymentHistoryLimit('1000'), 100)
})

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
    { canDelete: false, syncProvider: 'tochka', canEditReceipt: false }
  )
})

test('ссылку на чек можно прикрепить к проведённому пополнению или оплате тарифа', () => {
  const payment = {
    type: 'topup',
    purpose: 'balance',
    source: 'tochka',
    status: 'succeeded',
    receiptUrl: 'https://receipts.example.com/check/1',
  }
  assert.equal(canAttachPaymentReceipt(payment), true)
  assert.equal(canAttachPaymentReceipt({ ...payment, purpose: 'tariff' }), true)
  assert.equal(paymentManagementActions(payment).canEditReceipt, true)
  assert.equal(
    paymentManagementActions({ ...payment, purpose: 'tariff' }).canEditReceipt,
    true
  )
  assert.equal(
    serializePaymentHistoryItem(payment).receiptUrl,
    payment.receiptUrl
  )
  assert.equal(
    canAttachPaymentReceipt({ ...payment, status: 'pending' }),
    false
  )
  assert.equal(canAttachPaymentReceipt({ ...payment, type: 'charge' }), false)
  assert.equal(canAttachPaymentReceipt({ ...payment, purpose: 'system' }), false)
  assert.equal(canAttachPaymentReceipt({ ...payment, source: 'system' }), false)
  assert.equal(
    serializePaymentHistoryItem({ ...payment, purpose: 'tariff' }).receiptUrl,
    payment.receiptUrl
  )
  assert.equal(
    serializePaymentHistoryItem({ ...payment, status: 'pending' }).receiptUrl,
    ''
  )
  assert.equal(
    serializePaymentHistoryItem({ ...payment, receiptNotRequired: true })
      .receiptNotRequired,
    true
  )
  assert.equal(
    serializePaymentHistoryItem({ ...payment, status: 'pending', receiptNotRequired: true })
      .receiptNotRequired,
    false
  )
})

test('ссылка на чек допускает только безопасный HTTPS URL', () => {
  assert.equal(
    normalizePaymentReceiptUrl(' https://example.com/check '),
    'https://example.com/check'
  )
  assert.equal(normalizePaymentReceiptUrl(''), '')
  assert.equal(normalizePaymentReceiptUrl('javascript:alert(1)'), null)
  assert.equal(normalizePaymentReceiptUrl('http://example.com/check'), null)
  assert.equal(
    normalizePaymentReceiptUrl('https://user:pass@example.com/check'),
    null
  )
  assert.equal(normalizePaymentReceiptUrl('https://example.com/\ncheck'), null)
})

test('обновление чека фильтрует одновременно платёж, пользователя и tenant', () => {
  const user = { _id: USER_ID, tenantId: TENANT_ID }
  assert.deepEqual(
    buildPaymentReceiptFilter({ paymentId: 'payment-id', user }),
    {
      _id: 'payment-id',
      userId: USER_ID,
      tenantId: TENANT_ID,
    }
  )
  assert.notEqual(
    buildPaymentReceiptFilter({
      paymentId: 'payment-id',
      user: { ...user, tenantId: '66a000000000000000000099' },
    }).tenantId,
    TENANT_ID
  )
})

test('счётчик чеков учитывает проведённые поступления за баланс и тариф без ссылки', () => {
  const filter = buildMissingPaymentReceiptFilter()
  assert.equal(filter.type, 'topup')
  assert.deepEqual(filter.purpose.$in.sort(), ['balance', 'tariff'].sort())
  assert.equal(filter.status, 'succeeded')
  assert.deepEqual(
    filter.source.$in.sort(),
    ['manual', 'tochka', 'yookassa'].sort()
  )
  assert.deepEqual(filter.$or, [
    { receiptUrl: { $exists: false } },
    { receiptUrl: null },
    { receiptUrl: '' },
  ])
  assert.deepEqual(filter.receiptNotRequired, { $ne: true })
  assert.deepEqual(filter.purpose, buildReceiptablePaymentFilter().purpose)
})

test('отметка «чек не нужен» сохраняет ограничение операции владельцем и tenant', () => {
  const ownUser = { _id: USER_ID, tenantId: TENANT_ID }
  const ownFilter = buildPaymentReceiptFilter({
    paymentId: '66a000000000000000000010',
    user: ownUser,
  })
  assert.equal(ownFilter.userId, USER_ID)
  assert.equal(ownFilter.tenantId, TENANT_ID)
  assert.notDeepEqual(
    ownFilter,
    buildPaymentReceiptFilter({
      paymentId: '66a000000000000000000010',
      user: { ...ownUser, tenantId: '66a000000000000000000099' },
    })
  )
})
