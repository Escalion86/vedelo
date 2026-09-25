import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPaymentOperationsFilter,
  getPaymentOperationsSort,
  parsePaymentOperationsParams,
  serializePaymentOperationsUser,
} from './paymentOperations.js'

test('глобальный фильтр операций не добавляет tenantId и поддерживает категории', () => {
  const filter = buildPaymentOperationsFilter({
    category: 'tariff',
    status: 'succeeded',
    source: 'system',
    direction: 'out',
  })
  assert.equal('tenantId' in filter, false)
  assert.deepEqual(filter.$and[0], { status: 'succeeded' })
  assert.deepEqual(filter.$and[1], { source: 'system' })
  assert.deepEqual(filter.$and[2], { type: 'charge' })
  assert.equal(filter.$and[3].$or[0].purpose, 'tariff')
})

test('параметры глобального списка нормализуются и ограничивают даты', () => {
  const params = parsePaymentOperationsParams(
    new URLSearchParams({
      status: 'unknown',
      source: 'tochka',
      sort: 'amount_asc',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    })
  )
  assert.equal(params.status, 'all')
  assert.equal(params.source, 'tochka')
  assert.equal(params.sort, 'amount_asc')
  assert.equal(params.dateFrom.toISOString(), '2026-09-01T00:00:00.000Z')
  assert.equal(params.dateTo.toISOString(), '2026-09-30T23:59:59.999Z')
  assert.deepEqual(getPaymentOperationsSort('amount_asc'), {
    amount: 1,
    createdAt: -1,
    _id: -1,
  })
})

test('DTO пользователя в global-списке ограничен именем и одним контактом', () => {
  assert.deepEqual(
    serializePaymentOperationsUser({
      _id: '66a000000000000000000001',
      secondName: 'Иванов',
      firstName: 'Иван',
      email: 'ivan@example.test',
      phone: '79990000000',
    }),
    {
      id: '66a000000000000000000001',
      name: 'Иванов Иван',
      contact: '+79990000000',
    }
  )
})

test('фильтр без чека использует те же условия, что и бейдж', () => {
  const params = parsePaymentOperationsParams(
    new URLSearchParams({ category: 'receipt_missing' })
  )
  assert.equal(params.category, 'receipt_missing')
  const filter = buildPaymentOperationsFilter(params)
  assert.equal(filter.type, 'topup')
  assert.equal(filter.status, 'succeeded')
  assert.deepEqual(filter.purpose.$in.sort(), ['balance', 'tariff'].sort())
  assert.deepEqual(filter.$or, [
    { receiptUrl: { $exists: false } },
    { receiptUrl: null },
    { receiptUrl: '' },
  ])
})
