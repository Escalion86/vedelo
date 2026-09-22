import assert from 'node:assert/strict'
import test from 'node:test'
import {
  claimPaymentIntent,
  getReusablePaymentIntentData,
  resolvePaymentIdempotenceKey,
} from './paymentIntent.js'

const KEY = 'ef28560f-ee30-4c06-ba81-000d47aa75cc'

test('ключ платёжного намерения валидируется, а старые клиенты получают серверный ключ', () => {
  assert.deepEqual(resolvePaymentIdempotenceKey(KEY), {
    key: KEY,
    supplied: true,
  })
  assert.equal(resolvePaymentIdempotenceKey('bad-key').key, '')
  assert.match(
    resolvePaymentIdempotenceKey(undefined).key,
    /^[0-9a-f-]{36}$/i
  )
})

test('повтор одного ключа возвращает существующее намерение вместо новой записи', async () => {
  let stored = null
  const PaymentsModel = {
    async findOneAndUpdate(filter, update) {
      if (!stored) stored = { _id: 'payment-1', ...update.$setOnInsert }
      return stored
    },
    async findOne() {
      return stored
    },
  }
  const values = {
    amount: 800,
    status: 'pending',
    provider: 'tochka',
    purpose: 'tariff',
    tariffId: 'business',
  }
  const first = await claimPaymentIntent({
    PaymentsModel,
    tenantId: 'tenant-1',
    userId: 'user-1',
    idempotenceKey: KEY,
    values,
  })
  assert.equal(first.claimed, true)
  first.payment.rawProviderStatus = 'CREATED'
  first.payment.providerPaymentId = 'provider-1'
  first.payment.confirmationUrl = 'https://pay.example/1'

  const second = await claimPaymentIntent({
    PaymentsModel,
    tenantId: 'tenant-1',
    userId: 'user-1',
    idempotenceKey: KEY,
    values,
  })
  assert.equal(second.claimed, false)
  assert.deepEqual(
    getReusablePaymentIntentData(second.payment, {
      amount: 800,
      provider: 'tochka',
      purpose: 'tariff',
      tariffId: 'business',
    }),
    {
      paymentId: 'payment-1',
      providerPaymentId: 'provider-1',
      status: 'CREATED',
      amount: '800.00',
      confirmationUrl: 'https://pay.example/1',
    }
  )
  assert.equal(
    getReusablePaymentIntentData(second.payment, { tariffId: 'other' }),
    null
  )
})

test('гонка уникального индекса дочитывает уже созданное намерение', async () => {
  const stored = { _id: 'payment-1', rawProviderStatus: 'CREATED' }
  const PaymentsModel = {
    async findOneAndUpdate() {
      const error = new Error('duplicate')
      error.code = 11000
      throw error
    },
    async findOne() {
      return stored
    },
  }
  const result = await claimPaymentIntent({
    PaymentsModel,
    tenantId: 'tenant-1',
    userId: 'user-1',
    idempotenceKey: KEY,
    values: { amount: 800 },
  })
  assert.equal(result.claimed, false)
  assert.equal(result.payment, stored)
})

test('дедупликация платёжного намерения изолирована по tenant', async () => {
  const stored = new Map()
  const PaymentsModel = {
    async findOneAndUpdate(filter, update) {
      const key = JSON.stringify(filter)
      if (!stored.has(key)) stored.set(key, { _id: key, ...update.$setOnInsert })
      return stored.get(key)
    },
    async findOne(filter) {
      return stored.get(JSON.stringify(filter)) || null
    },
  }
  const claim = (tenantId) =>
    claimPaymentIntent({
      PaymentsModel,
      tenantId,
      userId: 'user-1',
      idempotenceKey: KEY,
      values: { amount: 800 },
    })

  assert.equal((await claim('tenant-1')).claimed, true)
  assert.equal((await claim('tenant-1')).claimed, false)
  assert.equal((await claim('tenant-2')).claimed, true)
  assert.equal(stored.size, 2)
})
