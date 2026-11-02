import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { googleImportUserFilter } from '@server/googleImportContext'
import {
  listUserCalendars,
  normalizeCalendarSettings,
} from '@server/googleUserCalendarClient'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'

export const POST = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId) {
    return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  }
  const access = await getUserTariffAccess(context.user._id)
  if (!access?.allowCalendarSync) {
    return mobileError('CALENDAR_TARIFF_REQUIRED', 'Синхронизация недоступна по тарифу', 403)
  }
  const body = await req.json().catch(() => ({}))
  const calendarId = body?.calendarId
  if (typeof calendarId !== 'string' || !calendarId || calendarId.length > 500 || calendarId !== calendarId.trim() || /[\s\u0000-\u001f]/u.test(calendarId)) return mobileError('CALENDAR_ID_REQUIRED', 'Не указан календарь', 400)
  await dbConnect()
  const filter = googleImportUserFilter(context.user._id, context.tenantId)
  const user = await Users.findOne(filter)
  if (!user) return mobileError('USER_NOT_FOUND', 'Пользователь не найден', 404)
  const settings = normalizeCalendarSettings(user)
  if (!settings.refreshToken) {
    return mobileError('CALENDAR_NOT_CONNECTED', 'Google Calendar не подключен', 400)
  }
  try {
    const calendars = await listUserCalendars(user)
    const selected = calendars.find((item) => item.id === calendarId && ['owner', 'writer'].includes(item.accessRole))
    if (!selected) return mobileError('CALENDAR_NOT_FOUND', 'Календарь не найден', 404)
    const current = await getRequestContext(req)
    if (String(current.user?._id || '') !== String(context.user._id) || String(current.tenantId || '') !== String(context.tenantId)) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
    if (!(await getUserTariffAccess(current.user._id))?.allowCalendarSync) return mobileError('CALENDAR_TARIFF_REQUIRED', 'Синхронизация недоступна по тарифу', 403)
    const saved = await Users.findOneAndUpdate(
      { ...filter, 'googleCalendar.refreshToken': settings.refreshToken },
      { $set: { 'googleCalendar.enabled': true, 'googleCalendar.calendarId': calendarId, 'googleCalendar.calendarName': selected.summary || '', 'googleCalendar.syncToken': '' } }
    )
    if (!saved) return mobileError('CALENDAR_CONNECTION_CHANGED', 'Подключение изменилось. Обновите состояние.', 409)
    return mobileSuccess({
      calendarId,
      calendarName: selected.summary || '',
    })
  } catch {
    return mobileError('CALENDAR_PROVIDER_ERROR', 'Не удалось выбрать календарь Google', 502)
  }
}
