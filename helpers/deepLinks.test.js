import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseDeepLinkUrl,
  parsePushNotificationUrl,
} from './deepLinks.js'

const eventId = '507f1f77bcf86cd799439011'

test('deep links принимают основной scheme vedelo', () => {
  const parsed = parseDeepLinkUrl(
    `vedelo://app/v1/event?event_id=${eventId}&org_id=tenant-a`
  )
  assert.equal(parsed.error, null)
  assert.equal(parsed.id, eventId)
})

test('deep links сохраняют поддержку legacy scheme artistcrm', () => {
  const parsed = parseDeepLinkUrl(
    `artistcrm://app/v1/event?event_id=${eventId}&org_id=tenant-a`
  )
  assert.equal(parsed.error, null)
  assert.equal(parsed.id, eventId)
})

test('push parser понимает основной deep link Ведело', () => {
  const parsed = parsePushNotificationUrl(
    `vedelo://app/v1/event?event_id=${eventId}&org_id=tenant-a`
  )
  assert.equal(parsed?.error, null)
  assert.equal(parsed?.id, eventId)
})

test('deep links отклоняют неизвестный scheme', () => {
  const parsed = parseDeepLinkUrl(
    `example://app/v1/event?event_id=${eventId}&org_id=tenant-a`
  )
  assert.equal(parsed.error, 'Unsupported scheme: example')
})
