import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { parseSubscription, savePushSubscription } from '@server/pushNotifications'
import { getBrandHostKind } from '@helpers/brand.mjs'
import DomainMigrationCodes from '@models/DomainMigrationCodes'
import PushSubscriptions from '@models/PushSubscriptions'

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { tenantId, user } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const subscription = parseSubscription(body?.subscription)
  if (!subscription) {
    return NextResponse.json(
      { success: false, error: 'Некорректная push-подписка' },
      { status: 400 }
    )
  }

  await dbConnect()
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const webAppOrigin = getBrandHostKind(host)
  await savePushSubscription({
    tenantId,
    subscription,
    userAgent: req.headers.get('user-agent') || '',
    isActive: true,
    webAppOrigin,
  })

  if (webAppOrigin === 'vedelo' && user?.domainMigrationId) {
    const migration = await DomainMigrationCodes.findOne({
      _id: user.domainMigrationId,
      userId: user._id,
      tenantId,
      usedAt: { $ne: null },
      legacyPushDisabledAt: null,
    }).lean()
    if (migration?.legacyPushEndpoint) {
      await PushSubscriptions.updateOne(
        {
          tenantId,
          endpoint: migration.legacyPushEndpoint,
          $or: [
            { webAppOrigin: 'artistcrm' },
            { webAppOrigin: { $exists: false } },
          ],
        },
        { $set: { isActive: false } }
      )
      await DomainMigrationCodes.updateOne(
        { _id: migration._id, legacyPushDisabledAt: null },
        { $set: { legacyPushDisabledAt: new Date() } }
      )
    }
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
