import webpush from 'web-push'
import crypto from 'crypto'
import PushDeliveryLogs from '@models/PushDeliveryLogs'
import PushSubscriptions from '@models/PushSubscriptions'
import { getDomainMigrationPhase } from '@helpers/domainMigration.mjs'

let isConfigured = false

const getVapidConfig = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || ''
  const privateKey = process.env.VAPID_PRIVATE_KEY || ''
  const subject = process.env.VAPID_SUBJECT || 'mailto:vedelo@inbox.ru'
  return {
    publicKey: String(publicKey).trim(),
    privateKey: String(privateKey).trim(),
    subject: String(subject).trim(),
  }
}

const ensureWebPushConfigured = () => {
  if (isConfigured) return true
  const { publicKey, privateKey, subject } = getVapidConfig()
  if (!publicKey || !privateKey || !subject) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  isConfigured = true
  return true
}

const parseSubscription = (value) => {
  if (!value || typeof value !== 'object') return null
  const endpoint = String(value.endpoint || '').trim()
  const keys = value.keys && typeof value.keys === 'object' ? value.keys : {}
  const p256dh = String(keys.p256dh || '').trim()
  const auth = String(keys.auth || '').trim()
  if (!endpoint || !p256dh || !auth) return null
  return {
    endpoint,
    keys: { p256dh, auth },
  }
}

const getEndpointDetails = (endpoint = '') => {
  const value = String(endpoint || '')
  if (!value) return { endpointHash: '', endpointHost: '' }
  let endpointHost = ''
  try {
    endpointHost = new URL(value).hostname
  } catch (error) {
    endpointHost = ''
  }
  return {
    endpointHash: crypto.createHash('sha256').update(value).digest('hex').slice(0, 16),
    endpointHost,
  }
}

const logPushDelivery = async ({ tenantId, endpoint = '', ...entry }) => {
  if (!tenantId) return null
  const endpointDetails = getEndpointDetails(endpoint)
  try {
    return await PushDeliveryLogs.create({
      tenantId,
      ...endpointDetails,
      ...entry,
      message: String(entry?.message || '').slice(0, 500),
    })
  } catch (error) {
    console.warn('push delivery log failed', {
      tenantId: String(tenantId),
      eventType: entry?.eventType,
      status: entry?.status,
      error: error?.message,
    })
    return null
  }
}

const savePushSubscription = async ({
  tenantId,
  subscription,
  userAgent = '',
  isActive = true,
  webAppOrigin = 'artistcrm',
}) => {
  const normalized = parseSubscription(subscription)
  if (!tenantId || !normalized) return null

  const existing = await PushSubscriptions.findOne({
    tenantId,
    endpoint: normalized.endpoint,
  })
    .select('keys isActive')
    .lean()
  const keysChanged =
    existing?.keys?.p256dh !== normalized.keys.p256dh ||
    existing?.keys?.auth !== normalized.keys.auth
  const shouldLog = !existing || keysChanged || existing?.isActive !== Boolean(isActive)

  const saved = await PushSubscriptions.findOneAndUpdate(
    {
      tenantId,
      endpoint: normalized.endpoint,
    },
    {
      $set: {
        tenantId,
        endpoint: normalized.endpoint,
        keys: normalized.keys,
        userAgent: String(userAgent || '').slice(0, 500),
        webAppOrigin: webAppOrigin === 'vedelo' ? 'vedelo' : 'artistcrm',
        isActive: Boolean(isActive),
      },
    },
    { upsert: true, returnDocument: 'after' }
  )
  if (shouldLog) {
    await logPushDelivery({
      tenantId,
      endpoint: normalized.endpoint,
      source: 'settings',
      eventType: 'subscription',
      status: existing ? 'updated' : 'created',
      message: existing ? 'Push-подписка обновлена' : 'Push-подписка создана',
      meta: {
        userAgent: String(userAgent || '').slice(0, 160),
        isActive: Boolean(isActive),
        keysChanged,
      },
    })
  }
  return saved
}

const deactivatePushSubscription = async ({ tenantId, endpoint }) => {
  if (!tenantId || !endpoint) return 0
  const result = await PushSubscriptions.updateOne(
    { tenantId, endpoint },
    { $set: { isActive: false } }
  )
  await logPushDelivery({
    tenantId,
    endpoint,
    source: 'settings',
    eventType: 'subscription',
    status: 'deactivated',
    message: 'Push-подписка отключена',
  })
  return Number(result?.modifiedCount || 0)
}

const countActivePushSubscriptions = async (tenantId) => {
  if (!tenantId) return 0
  return PushSubscriptions.countDocuments({
    tenantId,
    isActive: true,
  })
}

const normalizeWebPushTopic = (value) => {
  const rawTopic = String(value || '').trim()
  if (!rawTopic) return undefined
  const normalizedTopic = rawTopic.replace(/[^\w.-]/g, '-')
  if (normalizedTopic.length <= 32) return normalizedTopic

  const hash = crypto
    .createHash('sha256')
    .update(normalizedTopic)
    .digest('hex')
    .slice(0, 8)
  return `${normalizedTopic.slice(0, 23)}-${hash}`
}

const sendPushToTenant = async ({ tenantId, payload, source = 'unknown' }) => {
  if (!tenantId || !payload || typeof payload !== 'object') {
    return { ok: false, sent: 0, failed: 0, deactivated: 0 }
  }
  const payloadType = String(payload?.data?.type || payload?.type || '').trim()
  if (!ensureWebPushConfigured()) {
    await logPushDelivery({
      tenantId,
      source,
      eventType: 'send',
      status: 'skipped',
      payloadType,
      message: 'VAPID ключи не настроены',
    })
    return { ok: false, sent: 0, failed: 0, deactivated: 0, reason: 'no_vapid' }
  }

  const migration = getDomainMigrationPhase({
    startedAt: process.env.BRAND_MIGRATION_STARTED_AT,
  })
  const originFilter =
    migration.phase === 'locked' ? { webAppOrigin: 'vedelo' } : {}
  const docs = await PushSubscriptions.find({
    tenantId,
    isActive: true,
    ...originFilter,
  })
    .select('endpoint keys')
    .lean()

  if (!Array.isArray(docs) || docs.length === 0) {
    await logPushDelivery({
      tenantId,
      source,
      eventType: 'send',
      status: 'skipped',
      payloadType,
      subscriptions: 0,
      sent: 0,
      failed: 0,
      deactivated: 0,
      message: 'Активных push-подписок не найдено',
    })
    return { ok: true, sent: 0, failed: 0, deactivated: 0 }
  }

  let sent = 0
  let failed = 0
  let deactivated = 0
  const body = JSON.stringify(payload)
  const resolvedTtl = Number(payload?.ttl)
  const ttl = Number.isFinite(resolvedTtl) && resolvedTtl >= 0 ? resolvedTtl : 43200
  const urgencyValue = String(payload?.urgency || 'high').toLowerCase()
  const urgency =
    urgencyValue === 'very-low' ||
    urgencyValue === 'low' ||
    urgencyValue === 'normal' ||
    urgencyValue === 'high'
      ? urgencyValue
      : 'high'
  const topic = normalizeWebPushTopic(payload?.topic || payload?.tag)

  for (const doc of docs) {
    const subscription = parseSubscription(doc)
    if (!subscription) continue
    try {
      const response = await webpush.sendNotification(subscription, body, {
        TTL: ttl,
        urgency,
        topic,
      })
      sent += 1
      await PushSubscriptions.updateOne(
        { tenantId, endpoint: subscription.endpoint },
        { $set: { lastSentAt: new Date(), isActive: true } }
      )
      await logPushDelivery({
        tenantId,
        endpoint: subscription.endpoint,
        source,
        eventType: 'send',
        status: 'sent',
        payloadType,
        statusCode: Number(response?.statusCode || 0) || null,
        message: 'Push отправлен в push-сервис',
      })
    } catch (error) {
      failed += 1
      const statusCode = Number(error?.statusCode || 0)
      const shouldDeactivate = statusCode === 404 || statusCode === 410
      if (statusCode === 404 || statusCode === 410) {
        await PushSubscriptions.updateOne(
          { tenantId, endpoint: subscription.endpoint },
          { $set: { isActive: false } }
        )
        deactivated += 1
      }
      await logPushDelivery({
        tenantId,
        endpoint: subscription.endpoint,
        source,
        eventType: 'send',
        status: shouldDeactivate ? 'deactivated' : 'failed',
        payloadType,
        statusCode: statusCode || null,
        message: error?.body || error?.message || 'Ошибка отправки push',
      })
    }
  }

  await logPushDelivery({
    tenantId,
    source,
    eventType: 'summary',
    status: failed > 0 ? 'partial' : 'ok',
    payloadType,
    subscriptions: docs.length,
    sent,
    failed,
    deactivated,
    message: `Итог push-отправки: отправлено ${sent}, ошибок ${failed}, отключено ${deactivated}`,
  })

  return {
    ok: true,
    sent,
    failed,
    deactivated,
  }
}

const sendLegacyMigrationNoticeAndDeactivate = async ({ limit = 500 } = {}) => {
  const migration = getDomainMigrationPhase({
    startedAt: process.env.BRAND_MIGRATION_STARTED_AT,
  })
  if (migration.phase !== 'locked') {
    return { ok: true, skipped: true, processed: 0, sent: 0, failed: 0 }
  }
  if (!ensureWebPushConfigured()) {
    return {
      ok: false,
      skipped: true,
      processed: 0,
      sent: 0,
      failed: 0,
      reason: 'no_vapid',
    }
  }

  const docs = await PushSubscriptions.find({
    isActive: true,
    migrationNoticeSentAt: null,
    $or: [
      { webAppOrigin: 'artistcrm' },
      { webAppOrigin: { $exists: false } },
      { webAppOrigin: null },
    ],
  })
    .select('tenantId endpoint keys')
    .limit(Math.max(1, Math.min(Number(limit) || 500, 2000)))
    .lean()

  let sent = 0
  let failed = 0
  const processedAt = new Date()
  const body = JSON.stringify({
    title: 'ArtistCRM переехал в Ведело',
    body: 'Откройте приложение, чтобы безопасно перенести вход и установить Ведело.',
    icon: '/icons/AppImages/android/android-launchericon-192-192.png',
    badge: '/icons/notification-badge.svg',
    tag: 'vedelo-domain-migration',
    requireInteraction: true,
    data: {
      type: 'domain_migration',
      url: '/migrate',
    },
  })

  for (const doc of docs) {
    const subscription = parseSubscription(doc)
    if (!subscription) {
      failed += 1
      await PushSubscriptions.updateOne(
        { _id: doc._id },
        {
          $set: {
            migrationNoticeSentAt: processedAt,
            isActive: false,
          },
        }
      )
      continue
    }
    let delivered = false

    try {
      await webpush.sendNotification(subscription, body, {
        TTL: 259200,
        urgency: 'high',
        topic: 'vedelo-domain-migration',
      })
      sent += 1
      delivered = true
    } catch (error) {
      failed += 1
      await logPushDelivery({
        tenantId: doc.tenantId,
        endpoint: subscription.endpoint,
        source: 'domain-migration',
        eventType: 'send',
        status: 'failed',
        payloadType: 'domain_migration',
        statusCode: Number(error?.statusCode || 0) || null,
        message: error?.body || error?.message || 'Ошибка отправки push о переезде',
      })
    }

    await PushSubscriptions.updateOne(
      {
        _id: doc._id,
        isActive: true,
        migrationNoticeSentAt: null,
      },
      {
        $set: {
          migrationNoticeSentAt: processedAt,
          isActive: false,
          ...(delivered ? { lastSentAt: processedAt } : {}),
        },
      }
    )
  }

  return {
    ok: true,
    skipped: false,
    processed: docs.length,
    sent,
    failed,
  }
}

const getPushPublicKey = () => {
  const { publicKey } = getVapidConfig()
  return publicKey
}

export {
  parseSubscription,
  savePushSubscription,
  deactivatePushSubscription,
  countActivePushSubscriptions,
  sendPushToTenant,
  sendLegacyMigrationNoticeAndDeactivate,
  getPushPublicKey,
  logPushDelivery,
}
