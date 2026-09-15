import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { sendExpoPushToTenant } from '@server/expoPushNotifications'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'

export const POST = async (req) => {
  const { tenantId } = await getRequestContext(req)
  if (!tenantId) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  const result = await sendExpoPushToTenant({
    tenantId,
    payload: {
      title: 'Тест Android-уведомления',
      body: 'Ведело успешно связался с push-сервисом',
      data: { url: 'vedelo://more/notifications', type: 'mobile_push_test' },
      priority: 'high',
      tag: `mobile-push-test-${Date.now()}`,
    },
  })
  if (!result?.ok || Number(result.sent || 0) <= 0) {
    return mobileError('NO_ACTIVE_DEVICE', 'Активное Android-устройство для push не найдено', 409)
  }
  return mobileSuccess(result)
}
