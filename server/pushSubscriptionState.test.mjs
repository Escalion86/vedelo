import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getActiveExpoPushTokensFilter,
  getActivePushSubscriptionsFilter,
  getCurrentPushSubscriptionFilter,
} from './pushSubscriptionState.mjs'

test('active subscriptions are always scoped to the authenticated tenant', () => {
  assert.deepEqual(getActivePushSubscriptionsFilter('tenant-a'), {
    tenantId: 'tenant-a',
    isActive: true,
  })
  assert.notDeepEqual(
    getActivePushSubscriptionsFilter('tenant-a'),
    getActivePushSubscriptionsFilter('tenant-b')
  )
})

test('mobile push tokens are always scoped to the authenticated tenant', () => {
  assert.deepEqual(getActiveExpoPushTokensFilter('tenant-a'), {
    tenantId: 'tenant-a',
    isActive: true,
  })
  assert.notDeepEqual(
    getActiveExpoPushTokensFilter('tenant-a'),
    getActiveExpoPushTokensFilter('tenant-b')
  )
})

test('current device lookup cannot match another tenant endpoint', () => {
  const filter = getCurrentPushSubscriptionFilter({
    tenantId: 'tenant-a',
    endpoint: 'https://push.example/device-1',
  })

  assert.deepEqual(filter, {
    tenantId: 'tenant-a',
    endpoint: 'https://push.example/device-1',
    isActive: true,
  })
  assert.notEqual(filter.tenantId, 'tenant-b')
})
