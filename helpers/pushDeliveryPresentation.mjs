const PUSH_LOG_PREVIEW_LIMIT = 3

const PAYLOAD_TYPE_TITLES = {
  api_lead: 'Новая заявка',
  push_test: 'Тест push-уведомления',
}

const getPushNotificationLogContent = (payload) => ({
  notificationTitle: String(payload?.title || '').trim().slice(0, 200),
  notificationBody: String(payload?.body || '').trim().slice(0, 1000),
})

const getPushDeliveryPresentation = (log) => {
  const sent = Number(log?.sent || 0)
  const failed = Number(log?.failed || 0)
  const deactivated = Number(log?.deactivated || 0)

  if (sent > 0 && failed + deactivated > 0) {
    return {
      label: 'Частично доставлено',
      symbol: '!',
      className: 'text-amber-700',
    }
  }

  if (sent > 0) {
    return {
      label: 'Доставлено',
      symbol: '✓',
      className: 'text-emerald-700',
    }
  }

  return {
    label: 'Не доставлено',
    symbol: '✕',
    className: 'text-red-700',
  }
}

const getPushLogTitle = (log) =>
  String(log?.notificationTitle || '').trim() ||
  PAYLOAD_TYPE_TITLES[log?.payloadType] ||
  'Уведомление'

const getPushLogBody = (log) =>
  String(log?.notificationBody || '').trim() ||
  'Текст этого старого уведомления не сохранился.'

const toPushDeliveryLogDto = (item) => ({
  _id: String(item?._id || ''),
  payloadType: item?.payloadType || '',
  notificationTitle: item?.notificationTitle || '',
  notificationBody: item?.notificationBody || '',
  sent: item?.sent ?? null,
  failed: item?.failed ?? null,
  deactivated: item?.deactivated ?? null,
  createdAt: item?.createdAt ?? null,
})

export {
  PUSH_LOG_PREVIEW_LIMIT,
  getPushDeliveryPresentation,
  getPushLogBody,
  getPushLogTitle,
  getPushNotificationLogContent,
  toPushDeliveryLogDto,
}
