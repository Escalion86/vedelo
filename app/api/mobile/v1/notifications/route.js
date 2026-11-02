import ExpoPushTokens from '@models/ExpoPushTokens'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { currentMobilePushSubscriptions, migratedPushDevices } from '@server/mobilePushDelivery'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import {
  normalizeMobileReminderTime,
  serializeMobileNotificationSettings,
} from '@server/mobile/notificationSettings'

const getDeviceId = (req) => String(req.headers.get('x-device-id') || '').trim().slice(0, 200)

const loadSettings = async ({ tenantId, deviceId }) => {
  const [siteSettings, oldRecords, current, migrated] = await Promise.all([
    SiteSettings.findOne({ tenantId }).lean(),
    ExpoPushTokens.find({ tenantId, isActive: true }).select('pushToken deviceId').lean(),
    currentMobilePushSubscriptions(tenantId),
    migratedPushDevices(tenantId),
  ])
  const legacy = oldRecords.filter(row => !migrated.some(item => item.pushToken === row.pushToken || item.deviceId && item.deviceId === row.deviceId))
  return serializeMobileNotificationSettings({
    siteSettings,
    activeDeviceCount: legacy.length + current.length,
    deviceSubscribed: Boolean(deviceId && [...legacy, ...current].some(row => row.deviceId === deviceId)),
  })
}

export const GET = async (req) => {
  const { tenantId } = await getRequestContext(req)
  if (!tenantId) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  return mobileSuccess(await loadSettings({ tenantId, deviceId: getDeviceId(req) }))
}

export const PATCH = async (req) => {
  const { tenantId } = await getRequestContext(req)
  if (!tenantId) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  const body = await req.json().catch(() => ({}))
  const update = {}

  if (body.remindersEnabled !== undefined) {
    if (typeof body.remindersEnabled !== 'boolean') {
      return mobileError('REMINDERS_ENABLED_INVALID', 'Некорректное состояние напоминаний', 400)
    }
    update['custom.additionalEventsPushEnabled'] = body.remindersEnabled
    if (body.remindersEnabled) update['custom.publicLeadPushEnabled'] = true
  }
  if (body.reminderTime !== undefined) {
    const reminderTime = normalizeMobileReminderTime(body.reminderTime)
    if (!reminderTime) {
      return mobileError('REMINDER_TIME_INVALID', 'Время должно быть указано с шагом 15 минут', 400)
    }
    update['custom.additionalEventsPushTime'] = reminderTime
  }
  if (body.pushConfigured === true) {
    update['custom.publicLeadPushEnabled'] = true
  }
  if (!Object.keys(update).length) {
    return mobileError('NOTHING_TO_UPDATE', 'Нет настроек для сохранения', 400)
  }

  await dbConnect()
  await SiteSettings.findOneAndUpdate(
    { tenantId },
    { $set: { tenantId, ...update } },
    { upsert: true, returnDocument: 'after' }
  )
  return mobileSuccess(await loadSettings({ tenantId, deviceId: getDeviceId(req) }))
}
