import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeMobileClientMergePayload, serializeMobileClient } from './clients.js'

test('serializeMobileClient не передаёт tenant, password и notifications', () => {
  const result = serializeMobileClient({
    _id: 'client-1',
    firstName: 'Анна',
    max: 'https://max.ru/u/anna',
    messengerPushMuted: true,
    tenantId: 'tenant-secret',
    password: 'secret',
    notifications: { internal: true },
  })
  assert.equal(result.firstName, 'Анна')
  assert.equal(result.max, 'https://max.ru/u/anna')
  assert.equal(result.messengerPushMuted, true)
  assert.equal('tenantId' in result, false)
  assert.equal('password' in result, false)
  assert.equal('notifications' in result, false)
})

test('merge preview содержит только безопасные карточки и числовые счётчики', () => {
  const result = sanitizeMobileClientMergePayload({
    success: true,
    data: {
      targetClient: { _id: 'one', firstName: 'Основной', tenantId: 'secret' },
      duplicateClient: { _id: 'two', firstName: 'Дубль', password: 'secret' },
      preview: { events: 2, calls: 1, unexpected: 500 },
    },
  })
  assert.equal(result.data.preview.events, 2)
  assert.equal(result.data.preview.calls, 1)
  assert.equal('unexpected' in result.data.preview, false)
  assert.equal('tenantId' in result.data.targetClient, false)
})
