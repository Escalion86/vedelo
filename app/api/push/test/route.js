import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { sendPushToTenant } from '@server/pushNotifications'

export const POST = async () => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  await dbConnect()
  const result = await sendPushToTenant({
    tenantId,
    source: 'test',
    payload: {
      title: 'Тест push-уведомления',
      body: 'Проверка канала уведомлений для API-заявок',
      icon: '/icons/vedelo-v1/android/android-launchericon-192-192.png',
      badge: '/icons/notification-badge.svg',
      tag: `push-test-${Date.now()}`,
      data: {
        url: '/cabinet/eventsUpcoming',
        type: 'push_test',
      },
    },
  })

  if (result?.reason === 'no_vapid') {
    return NextResponse.json(
      {
        success: false,
        error: 'Push не настроен: отсутствуют VAPID ключи',
        data: result,
      },
      { status: 503 }
    )
  }

  if (Number(result?.sent || 0) <= 0 && Number(result?.failed || 0) > 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Push не доставлен: есть ошибки отправки в push-сервис',
        data: result,
      },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true, data: result }, { status: 200 })
}
