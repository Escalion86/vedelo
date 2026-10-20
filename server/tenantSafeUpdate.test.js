import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTenantSafeUpdate,
  getTenantSafeUpdateFields,
} from './tenantSafeUpdate.js'

test('tenant update strips ownership and immutable fields', () => {
  assert.deepEqual(
    getTenantSafeUpdateFields({
      _id: 'other-id',
      tenantId: 'other-tenant',
      createdAt: 'yesterday',
      updatedAt: 'today',
      __v: 42,
      aiEditReceipts: ['forged'],
      aiEditPaymentFingerprint: 'forged',
      firstName: 'Иван',
    }),
    { firstName: 'Иван' }
  )
})

test('tenant update rejects Mongo operators and dotted paths', () => {
  assert.deepEqual(
    buildTenantSafeUpdate({
      $set: { tenantId: 'other-tenant' },
      'tenantId.value': 'other-tenant',
      title: 'Новая услуга',
    }),
    { $set: { title: 'Новая услуга' } }
  )
})

test('tenant update handles non-object payloads', () => {
  assert.deepEqual(buildTenantSafeUpdate(null), { $set: {} })
  assert.deepEqual(buildTenantSafeUpdate([]), { $set: {} })
})
