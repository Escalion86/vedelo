import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import PushSubscriptions from '@models/PushSubscriptions'
import {
  countActivePushSubscriptions,
  parseSubscription,
} from '@server/pushNotifications'
import { getCurrentPushSubscriptionFilter } from '@server/pushSubscriptionState.mjs'
import { countActiveExpoPushTokens } from '@server/expoPushNotifications'

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const subscription = parseSubscription(body?.subscription)
  await dbConnect()
  const [activeWebSubscriptions, activeMobileSubscriptions, currentDevice] =
    await Promise.all([
      countActivePushSubscriptions(tenantId),
      countActiveExpoPushTokens(tenantId),
      subscription
        ? PushSubscriptions.findOne(
            getCurrentPushSubscriptionFilter({
              tenantId,
              endpoint: subscription.endpoint,
            })
          )
            .select('_id')
            .lean()
        : Promise.resolve(null),
    ])

  return NextResponse.json(
    {
      success: true,
      data: {
        activeSubscriptions: activeWebSubscriptions + activeMobileSubscriptions,
        activeWebSubscriptions,
        activeMobileSubscriptions,
        currentDeviceActive: Boolean(currentDevice),
      },
    },
    { status: 200 }
  )
}
