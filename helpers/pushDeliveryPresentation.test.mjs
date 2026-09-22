import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PUSH_LOG_PREVIEW_LIMIT,
  getPushDeliveryPresentation,
  getPushLogBody,
  getPushLogTitle,
  getPushNotificationLogContent,
  toPushDeliveryLogDto,
} from './pushDeliveryPresentation.mjs'

test('push history preview is limited to three entries', () => {
  assert.equal(PUSH_LOG_PREVIEW_LIMIT, 3)
})

test('notification content keeps the exact trimmed title and body', () => {
  assert.deepEqual(
    getPushNotificationLogContent({
      title: '  Новая заявка  ',
      body: '  Телефон: +7 999 123-45-67 | Источник: Сайт  ',
    }),
    {
      notificationTitle: 'Новая заявка',
      notificationBody:
        'Телефон: +7 999 123-45-67 | Источник: Сайт',
    }
  )
})

test('delivery status is presented in user-facing terms', () => {
  assert.deepEqual(
    getPushDeliveryPresentation({ sent: 2, failed: 0, deactivated: 0 }),
    {
      label: 'Доставлено',
      symbol: '✓',
      className: 'text-emerald-700',
    }
  )
  assert.equal(
    getPushDeliveryPresentation({ sent: 1, failed: 1 }).label,
    'Частично доставлено'
  )
  assert.equal(
    getPushDeliveryPresentation({ sent: 0, failed: 1 }).label,
    'Не доставлено'
  )
})

test('legacy log gets a clear fallback instead of technical details', () => {
  assert.equal(getPushLogTitle({ payloadType: 'api_lead' }), 'Новая заявка')
  assert.equal(
    getPushLogBody({}),
    'Текст этого старого уведомления не сохранился.'
  )
})

test('public history DTO does not expose technical delivery fields', () => {
  const dto = toPushDeliveryLogDto({
    _id: 'log-1',
    source: 'public_lead',
    endpointHost: 'fcm.googleapis.com',
    endpointHash: 'secret-hash',
    statusCode: 201,
    notificationTitle: 'Новая заявка',
    notificationBody: 'Телефон: +7 999 123-45-67',
    sent: 1,
    failed: 0,
  })

  assert.equal(dto.notificationTitle, 'Новая заявка')
  assert.equal('source' in dto, false)
  assert.equal('endpointHost' in dto, false)
  assert.equal('endpointHash' in dto, false)
  assert.equal('statusCode' in dto, false)
})
