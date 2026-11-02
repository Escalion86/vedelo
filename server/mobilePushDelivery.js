import { randomUUID } from 'node:crypto'
import MobilePushSubscriptions from '@models/MobilePushSubscriptions'
import MobileSessions from '@models/MobileSessions'
import Users from '@models/Users'
import { activeMobilePushSubscriptions } from '@server/mobile/pushSubscriptions.mjs'
import { mobilePushData, sendRuStorePush } from '@server/ruStorePush.mjs'

export const migratedPushDevices = tenantId => MobilePushSubscriptions.find({ tenantId }).select('deviceId pushToken').lean()
export async function currentMobilePushSubscriptions(tenantId) {
  const records = await activeMobilePushSubscriptions({ model: MobilePushSubscriptions, sessions: MobileSessions, tenantId })
  if (!records.length) return []
  const users = await Users.find({ $or: [{ tenantId }, { _id: tenantId, tenantId: null }], _id: { $in: records.map(row => row.userId) }, archive: { $ne: true } }).select('_id').lean()
  return records.filter(row => users.some(user => String(user._id) === String(row.userId)))
}
export async function sendRegisteredMobilePush({ tenantId, payload, expoClient }) {
  const subscriptions = await currentMobilePushSubscriptions(tenantId)
  let sent = 0, failed = 0, invalid = 0
  const deliveryMessageId = randomUUID()
  // Bound provider concurrency and keep each installation on exactly one transport.
  for (let offset = 0; offset < subscriptions.length; offset += 10) {
    await Promise.all(subscriptions.slice(offset, offset + 10).map(async subscription => {
      const data = mobilePushData(subscription, payload, deliveryMessageId)
      let result
      if (subscription.provider === 'rustore') result = await sendRuStorePush(subscription, data)
      else {
        try {
          // Data only: the native receiver checks session/privacy before presentation,
          // including when JS is stopped. Never let FCM auto-display a stale account.
          const [receipt] = await expoClient.sendPushNotificationsAsync([{ to: subscription.pushToken,
            data, priority: 'high', ttl: 3600, _contentAvailable: true }])
          result = { ok: receipt?.status === 'ok', invalid: receipt?.details?.error === 'DeviceNotRegistered' }
        } catch { result = { ok: false, invalid: false } }
      }
      if (result.ok) sent++; else failed++
      if (result.invalid) {
        invalid++
        await MobilePushSubscriptions.updateOne({ tenantId, _id: subscription._id, revision: subscription.revision }, { $set: { isActive: false } })
      }
    }))
  }
  return { ok: true, sent, failed, invalid }
}
export async function deactivateRegisteredMobilePush(tenantId) {
  const result = await MobilePushSubscriptions.updateMany({ tenantId, isActive: true }, { $set: { isActive: false } })
  return result.modifiedCount || 0
}
