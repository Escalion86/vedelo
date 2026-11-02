import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { googleImportUserFilter } from '@server/googleImportContext'
import {
  normalizeCalendarSettings,
} from '@server/googleUserCalendarClient'
import {
  clearGoogleCalendarCredentials,
  normalizeMobileGoogleCalendarPatch,
  serializeMobileGoogleCalendar,
} from '@server/mobile/googleCalendar'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'

const getContext = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId) return { error: 'unauthorized' }
  const access = await getUserTariffAccess(context.user._id)
  return { context, access }
}

export const GET = async (req) => {
  const { context, access, error } = await getContext(req)
  if (error) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  const user = await Users.findOne(googleImportUserFilter(context.user._id, context.tenantId)).select('googleCalendar').lean()
  if (!user) return mobileError('USER_NOT_FOUND', 'Пользователь не найден', 404)
  return mobileSuccess(serializeMobileGoogleCalendar(
    normalizeCalendarSettings(user),
    access
  ))
}

export const PATCH = async (req) => {
  const { context, access, error } = await getContext(req)
  if (error) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  if (!access?.allowCalendarSync) {
    return mobileError('CALENDAR_TARIFF_REQUIRED', 'Синхронизация недоступна по тарифу', 403)
  }
  const body = await req.json().catch(() => ({}))
  let update
  try { update = normalizeMobileGoogleCalendarPatch(body) }
  catch { return mobileError('CALENDAR_SETTINGS_INVALID', 'Проверьте настройки календаря и напоминаний', 400) }
  await dbConnect()
  const filter = googleImportUserFilter(context.user._id, context.tenantId)
  const user = await Users.findOne(filter)
  if (!user) return mobileError('USER_NOT_FOUND', 'Пользователь не найден', 404)
  const settings = normalizeCalendarSettings(user)
  if (!settings.refreshToken) {
    return mobileError('CALENDAR_NOT_CONNECTED', 'Google Calendar не подключен', 400)
  }
  const saved = await Users.findOneAndUpdate(
    { ...filter, 'googleCalendar.refreshToken': settings.refreshToken },
    { $set: update }, { returnDocument: 'after', runValidators: true }
  )
  if (!saved) return mobileError('CALENDAR_CONNECTION_CHANGED', 'Подключение изменилось. Обновите состояние.', 409)
  return mobileSuccess(serializeMobileGoogleCalendar(
    normalizeCalendarSettings(saved),
    access
  ))
}

export const DELETE = async (req) => {
  const { context, access, error } = await getContext(req)
  if (error) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  const filter = googleImportUserFilter(context.user._id, context.tenantId)
  const user = await Users.findOne(filter)
  if (!user) return mobileError('USER_NOT_FOUND', 'Пользователь не найден', 404)
  const cleared = clearGoogleCalendarCredentials({ googleCalendar: {} }).googleCalendar
  const saved = await Users.findOneAndUpdate(filter, { $set: Object.fromEntries(Object.entries(cleared).map(([key, value]) => [`googleCalendar.${key}`, value])) }, { returnDocument: 'after' })
  if (!saved) return mobileError('USER_NOT_FOUND', 'Пользователь не найден', 404)
  return mobileSuccess(serializeMobileGoogleCalendar(
    normalizeCalendarSettings(saved),
    access
  ))
}
