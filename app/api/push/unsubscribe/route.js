import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import {
  countActivePushSubscriptions,
  deactivateAllPushSubscriptions,
  deactivatePushSubscription,
  parseSubscription,
} from '@server/pushNotifications'
import { deactivateAllExpoPushTokens } from '@server/expoPushNotifications'

const resolveEndpoint = (body) => {
  if (typeof body?.endpoint === 'string') return body.endpoint
  const parsed = parseSubscription(body?.subscription)
  return parsed?.endpoint || ''
}

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  await dbConnect()
  if (body?.all === true) {
    const [webDeactivated, mobileDeactivated] = await Promise.all([
      deactivateAllPushSubscriptions(tenantId),
      deactivateAllExpoPushTokens(tenantId),
    ])
    return NextResponse.json(
      {
        success: true,
        data: {
          deactivated: webDeactivated + mobileDeactivated,
          webDeactivated,
          mobileDeactivated,
          activeSubscriptions: 0,
        },
      },
      { status: 200 }
    )
  }

  const endpoint = String(resolveEndpoint(body) || '').trim()
  if (!endpoint) {
    return NextResponse.json(
      { success: false, error: 'endpoint обязателен' },
      { status: 400 }
    )
  }

  await deactivatePushSubscription({ tenantId, endpoint })
  const activeSubscriptions = await countActivePushSubscriptions(tenantId)
  return NextResponse.json(
    { success: true, data: { activeSubscriptions } },
    { status: 200 }
  )
}
