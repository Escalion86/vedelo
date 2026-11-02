import { NextResponse } from 'next/server'
import getRequestContext from '@server/getRequestContext'
import MobilePushSubscriptions from '@models/MobilePushSubscriptions'
import MobileSessions from '@models/MobileSessions'
import ExpoPushTokens from '@models/ExpoPushTokens'
import { registerMobilePushSubscription, validateMobilePushSubscription } from '@server/mobile/pushSubscriptions.mjs'
import { ruStorePushConfig } from '@server/ruStorePush.mjs'

export async function POST(req) {
  const { tenantId, user, mobileSessionId } = await getRequestContext(req)
  if (!tenantId || !mobileSessionId) return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })
  try {
    const body = validateMobilePushSubscription(await req.json())
    if (body.provider === 'rustore' && !ruStorePushConfig(body.applicationId)) return NextResponse.json({ success: false, error: 'RuStore Push ещё не настроен для этой сборки' }, { status: 503 })
    const saved = await registerMobilePushSubscription({ model: MobilePushSubscriptions, sessions: MobileSessions, tenantId, userId: user._id, sessionId: mobileSessionId, body })
    // Preserve old APK support, but never deliver a second copy to a migrated device.
    if (saved.deviceId) await ExpoPushTokens.updateMany({ tenantId, deviceId: saved.deviceId, isActive: true }, { $set: { isActive: false } })
    return NextResponse.json({ success: true, data: { provider: saved.provider, deliveryId: saved.deliveryId, revision: saved.revision } })
  } catch (error) { return NextResponse.json({ success: false, error: error.status ? error.message : 'Не удалось зарегистрировать уведомления' }, { status: error.status || 500 }) }
}
export async function DELETE(req) {
  const { tenantId, mobileSessionId } = await getRequestContext(req)
  if (!tenantId || !mobileSessionId) return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })
  // Only this authorized session: a delayed logout cannot disable a newer login.
  await MobilePushSubscriptions.updateMany({ tenantId, sessionId: mobileSessionId, isActive: true }, { $set: { isActive: false } })
  return NextResponse.json({ success: true })
}
