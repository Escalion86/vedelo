import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildIncomingMessagePushPayload,
  formatUnreadCount,
} from './incomingMessageNotification.js'

test('builds incoming message push with client and nearest event', () => {
  const payload = buildIncomingMessagePushPayload({
    provider: 'telegram',
    messageId: 'message-1',
    messageText: 'Добрый день, уточните время начала',
    clientId: 'client-1',
    clientName: 'Анна Иванова',
    event: {
      _id: 'event-1',
      eventType: 'Свадьба',
      eventDate: '2026-08-26T12:00:00.000Z',
    },
  })

  assert.equal(payload.title, 'Новое сообщение · Telegram')
  assert.match(payload.body, /Анна Иванова/)
  assert.match(payload.body, /Ближайшее: Свадьба/)
  assert.equal(payload.data.url, '/cabinet/clients?openMessenger=client-1')
  assert.equal(payload.data.clientId, 'client-1')
})

test('builds a safe fallback when event is not linked yet', () => {
  const payload = buildIncomingMessagePushPayload({
    provider: 'avito',
    messageId: 'message-2',
    clientName: 'Клиент Avito',
  })

  assert.equal(payload.body, 'Клиент Avito')
  assert.equal(payload.data.url, '/cabinet/clients')
  assert.equal(payload.data.eventId, '')
})

test('uses a stable per-conversation tag and marks repeated updates as silent', () => {
  const first = buildIncomingMessagePushPayload({
    provider: 'telegram',
    messageId: 'message-1',
    messageText: 'Привет',
    clientId: 'client-1',
    clientName: 'Анна Иванова',
    conversationId: 'conversation-1',
    unreadCount: 1,
  })
  const second = buildIncomingMessagePushPayload({
    provider: 'telegram',
    messageId: 'message-2',
    messageText: 'Вы на месте?',
    clientId: 'client-1',
    clientName: 'Анна Иванова',
    conversationId: 'conversation-1',
    unreadCount: 2,
  })

  assert.equal(first.tag, 'incoming-message-telegram-client-1')
  assert.equal(second.tag, 'incoming-message-telegram-client-1')
  assert.equal(first.requireInteraction, true)
  assert.equal(first.silent, false)
  assert.equal(first.renotify, false)
  assert.equal(second.requireInteraction, false)
  assert.equal(second.silent, true)
  assert.match(second.body, /2 новых сообщения/)
  assert.equal(second.data.conversationKey, 'client-1')
  assert.equal(second.data.unreadCount, 2)
})

test('falls back to conversation id when client is not linked yet', () => {
  const payload = buildIncomingMessagePushPayload({
    provider: 'vk',
    messageId: 'message-3',
    messageText: 'Здравствуйте',
    clientName: 'Гость VK',
    conversationId: 'conversation-9',
    unreadCount: 3,
  })

  assert.equal(payload.tag, 'incoming-message-vk-conversation-9')
  assert.equal(payload.data.conversationKey, 'conversation-9')
  assert.match(payload.body, /3 новых сообщения/)
})

test('keeps call recording notifications unchanged', () => {
  const payload = buildIncomingMessagePushPayload({
    provider: 'novofon',
    messageId: 'call-1',
    clientName: 'Анна Иванова',
    notificationKind: 'recording',
    conversationId: 'conversation-1',
    unreadCount: 5,
  })

  assert.equal(payload.tag, 'call-recording-novofon-call-1')
  assert.equal(payload.requireInteraction, true)
  assert.equal(payload.silent, false)
  assert.doesNotMatch(payload.body, /новых сообщ/)
})

test('pluralizes unread counter in Russian', () => {
  assert.equal(formatUnreadCount(1), '')
  assert.equal(formatUnreadCount(2), '2 новых сообщения')
  assert.equal(formatUnreadCount(5), '5 новых сообщений')
  assert.equal(formatUnreadCount(21), '21 новое сообщение')
  assert.equal(formatUnreadCount(11), '11 новых сообщений')
})

test('opens the client messenger without an event for each messaging provider', () => {
  for (const provider of ['telegram', 'vk', 'avito']) {
    const payload = buildIncomingMessagePushPayload({
      provider,
      clientId: 'client&1',
    })
    assert.equal(payload.data.url, '/cabinet/clients?openMessenger=client%261')
  }
})

test('recordings still open their event even when a client is linked', () => {
  const payload = buildIncomingMessagePushPayload({
    provider: 'novofon',
    clientId: 'client-1',
    notificationKind: 'recording',
    event: { _id: 'event-1' },
  })
  assert.equal(payload.data.url, '/cabinet/eventsUpcoming?openEvent=event-1')
})

test('preserves navigation supported by installed Android versions', () => {
  const payload = buildIncomingMessagePushPayload({
    provider: 'telegram',
    clientId: 'client-1',
    target: 'mobile',
    event: { _id: 'event-1' },
  })
  assert.equal(payload.data.url, '/cabinet/eventsUpcoming?openEvent=event-1')
})
