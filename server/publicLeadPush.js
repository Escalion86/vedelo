import {
  countActivePushSubscriptions,
  logPushDelivery,
} from '@server/pushNotifications'
import { sendMultiChannelPushToTenant } from '@server/multiChannelPush'

const formatPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits[0] === '7') {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }
  if (digits.length === 11 && digits[0] === '8') {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }
  if (digits.length === 10) {
    return `+7 ${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`
  }
  return `+${digits}`
}

const buildApiLeadPushPayload = ({ event, normalizedData }) => {
  const source = String(normalizedData?.source || 'public_api')
  const formattedPhone = formatPhone(normalizedData?.phone)
  const bodyParts = []
  if (formattedPhone) bodyParts.push(`Телефон: ${formattedPhone}`)
  if (source) bodyParts.push(`Источник: ${source}`)

  return {
    title: 'Новая заявка',
    body: bodyParts.join(' | ') || 'Откройте кабинет для просмотра',
    icon: '/icons/vedelo-v1/android/android-launchericon-192-192.png',
    badge: '/icons/notification-badge.svg',
    tag: `api-lead-${event?._id || Date.now()}`,
    data: {
      url: `/cabinet/eventsUpcoming?openEvent=${event?._id}`,
      eventId: String(event?._id || ''),
      type: 'api_lead',
    },
  }
}

const notifyApiLeadCreated = async ({ tenantId, event, normalizedData }) => {
  if (!tenantId || !event?._id) return null
  const payload = buildApiLeadPushPayload({ event, normalizedData })
  return sendMultiChannelPushToTenant({
    tenantId,
    payload,
    source: 'public_lead',
  })
}

const getPublicLeadPushState = async ({ tenantId, configured }) => {
  const activeSubscriptions = await countActivePushSubscriptions(tenantId)
  const enabledBySetting = configured === true
  const enabledByExistingSubscription =
    configured === false && activeSubscriptions > 0
  const enabled = enabledBySetting || enabledByExistingSubscription

  let skippedReason = ''
  if (!enabled) {
    skippedReason =
      activeSubscriptions <= 0 ? 'no_active_subscriptions' : 'disabled'
  }

  return {
    enabled,
    configured,
    activeSubscriptions,
    skippedReason,
    fallbackUsed: enabledByExistingSubscription,
  }
}

const resolvePublicLeadPushEnabled = async ({ tenantId, configured }) => {
  const state = await getPublicLeadPushState({ tenantId, configured })
  return state.enabled
}

const logPublicLeadPushDiagnostic = async ({
  tenantId,
  event,
  stage,
  status = 'info',
  message,
  meta = {},
}) => {
  console.info('public lead push diagnostic', {
    tenantId: String(tenantId || ''),
    eventId: String(event?._id || ''),
    stage,
    status,
    ...meta,
  })
  await logPushDelivery({
    tenantId,
    source: 'public_lead',
    eventType: `diagnostic:${stage}`,
    status,
    payloadType: 'api_lead',
    message,
    meta: {
      eventId: String(event?._id || ''),
      ...meta,
    },
  })
}

const logPublicLeadPushSkipped = async ({
  tenantId,
  event,
  reason,
  configured,
  activeSubscriptions,
  fallbackUsed,
}) => {
  await logPushDelivery({
    tenantId,
    source: 'public_lead',
    eventType: 'send',
    status: 'skipped',
    payloadType: 'api_lead',
    message: `Push по API-заявке пропущен: ${reason}`,
    meta: {
      eventId: String(event?._id || ''),
      configured,
      activeSubscriptions,
      fallbackUsed,
      reason,
    },
  })
}

const logPublicLeadPushError = async ({ tenantId, event, error }) => {
  await logPushDelivery({
    tenantId,
    source: 'public_lead',
    eventType: 'send',
    status: 'failed',
    payloadType: 'api_lead',
    failed: 1,
    message: error?.message || 'Ошибка отправки push по API-заявке',
    meta: {
      eventId: String(event?._id || ''),
    },
  })
}

export {
  notifyApiLeadCreated,
  getPublicLeadPushState,
  resolvePublicLeadPushEnabled,
  logPublicLeadPushDiagnostic,
  logPublicLeadPushSkipped,
  logPublicLeadPushError,
}
