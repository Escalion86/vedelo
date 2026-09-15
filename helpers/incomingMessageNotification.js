const PROVIDER_LABELS = {
  avito: 'Avito',
  novofon: 'Телефония',
  telegram: 'Telegram',
  vk: 'VK',
}

const normalizeText = (value, fallback = '') =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim() || fallback

const truncateText = (value, maxLength = 120) => {
  const text = normalizeText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

const formatEventDate = (value) => {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const pluralizeMessages = (count) => {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return 'новых сообщений'
  if (mod10 === 1) return 'новое сообщение'
  if (mod10 >= 2 && mod10 <= 4) return 'новых сообщения'
  return 'новых сообщений'
}

export const formatUnreadCount = (count) => {
  const value = Number(count)
  if (!Number.isFinite(value) || value <= 1) return ''
  const rounded = Math.floor(value)
  return `${rounded} ${pluralizeMessages(rounded)}`
}

export const buildIncomingMessagePushPayload = ({
  provider,
  messageId,
  messageText,
  clientId,
  clientName,
  event,
  notificationKind = 'message',
  conversationId,
  unreadCount = 0,
}) => {
  const providerLabel = PROVIDER_LABELS[provider] || normalizeText(provider, 'CRM')
  const safeClientName = normalizeText(clientName, 'Клиент')
  const eventId = String(event?._id || '')
  const eventTitle = normalizeText(event?.eventType, 'Мероприятие')
  const eventDate = formatEventDate(event?.eventDate)
  const isRecording = notificationKind === 'recording'
  const safeUnreadCount = Number.isFinite(Number(unreadCount))
    ? Math.max(0, Math.floor(Number(unreadCount)))
    : 0
  const isFirstInSeries = safeUnreadCount <= 1

  const bodyParts = [safeClientName]
  const unreadPart = isRecording ? '' : formatUnreadCount(safeUnreadCount)
  if (unreadPart) bodyParts.push(unreadPart)
  if (messageText) bodyParts.push(truncateText(messageText))
  if (eventId) {
    bodyParts.push(
      `Ближайшее: ${eventTitle}${eventDate ? `, ${eventDate}` : ''}`
    )
  }

  const conversationKey = String(
    clientId || conversationId || messageId || Date.now()
  )

  return {
    title: isRecording
      ? `Получена запись звонка · ${safeClientName}`
      : `Новое сообщение · ${providerLabel}`,
    body: bodyParts.join(' • '),
    icon: '/icons/vedelo-v1/android/android-launchericon-192-192.png',
    badge: '/icons/notification-badge.svg',
    tag: isRecording
      ? `call-recording-${provider}-${messageId || Date.now()}`
      : `incoming-message-${provider}-${conversationKey}`,
    renotify: false,
    silent: isRecording ? false : !isFirstInSeries,
    requireInteraction: isRecording ? true : isFirstInSeries,
    data: {
      url: eventId
        ? `/cabinet/eventsUpcoming?openEvent=${eventId}`
        : '/cabinet/clients',
      clientId: String(clientId || ''),
      eventId,
      provider,
      conversationKey,
      unreadCount: safeUnreadCount,
      type: isRecording ? 'telephony_recording' : 'incoming_messenger_message',
    },
  }
}

export { formatEventDate, PROVIDER_LABELS }
