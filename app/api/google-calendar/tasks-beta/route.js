import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Users from '@models/Users'
import Links from '@models/GoogleAdditionalLinks'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { isGoogleTasksDeveloper, hasGoogleTasksScope } from '@helpers/googleTasksBeta.mjs'
import { listGoogleTaskLists, syncGoogleAdditionalEvents } from '@server/googleAdditionalSync'

export const runtime = 'nodejs'
const reply = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
const context = async () => {
  const ctx = await getTenantContext()
  if (!ctx.user?._id || !ctx.tenantId) return { error: reply({ success: false, error: 'Не авторизован' }, 401) }
  if (!isGoogleTasksDeveloper(ctx.user)) return { error: reply({ success: false, error: 'Только для разработчика' }, 403) }
  if (!(await getUserTariffAccess(ctx.user._id))?.allowCalendarSync) return { error: reply({ success: false, error: 'Синхронизация недоступна по тарифу' }, 403) }
  return ctx
}
export const GET = async () => {
  const { user, tenantId, error } = await context()
  if (error) return error
  try {
    const authorized = hasGoogleTasksScope(user) && Boolean(user.googleCalendar?.refreshToken)
    const lists = authorized ? await listGoogleTaskLists(user) : []
    const errors = await Links.find({ tenantId, userId: user._id, error: { $ne: '' } })
      .select('_id eventId error').limit(100).lean()
    return reply({ success: true, data: { authorized, lists, errors,
      enabled: user.googleCalendar?.tasksBeta?.enabled === true,
      defaultMode: user.googleCalendar?.tasksBeta?.defaultMode || 'event',
      taskListId: user.googleCalendar?.tasksBeta?.taskListId || '',
    } })
  } catch {
    return reply({ success: false, error: 'Не удалось прочитать Google Tasks. Проверьте доступ и включение API.' }, 502)
  }
}
export const POST = async (req) => {
  const { user, tenantId, error } = await context()
  if (error) return error
  let body
  try { body = await req.json() } catch { return reply({ success: false, error: 'Некорректный запрос' }, 400) }
  if (!['settings', 'sync', 'restore'].includes(body?.action)) return reply({ success: false, error: 'Неизвестное действие' }, 400)
  if (!user.googleCalendar?.refreshToken) return reply({ success: false, error: 'Подключите Google Calendar' }, 409)
  try {
    if (body.action === 'settings') {
      if (!hasGoogleTasksScope(user)) return reply({ success: false, error: 'Разрешите доступ к Google Tasks' }, 409)
      if (!['event', 'task'].includes(body.defaultMode) || typeof body.taskListId !== 'string') return reply({ success: false, error: 'Выберите способ синхронизации и список задач' }, 400)
      const lists = await listGoogleTaskLists(user)
      if (!lists.some((list) => list.id === body.taskListId)) return reply({ success: false, error: 'Список задач недоступен' }, 400)
      await Users.updateOne({ _id: user._id, $or: [{ tenantId }, { tenantId: null, _id: tenantId }] }, {
        $set: { 'googleCalendar.tasksBeta': { enabled: true, defaultMode: body.defaultMode, taskListId: body.taskListId } },
      })
      return reply({ success: true })
    }
    if (!user.googleCalendar?.tasksBeta?.enabled || !user.googleCalendar.enabled) return reply({ success: false, error: 'Тестовая синхронизация выключена или приостановлена' }, 409)
    if (body.eventId && !mongoose.Types.ObjectId.isValid(body.eventId)) return reply({ success: false, error: 'Некорректный заказ' }, 400)
    let restoreId
    let eventId = body.eventId
    if (body.action === 'restore') {
      if (!mongoose.Types.ObjectId.isValid(body.id)) return reply({ success: false, error: 'Некорректная связь' }, 400)
      const link = await Links.findOne({ _id: body.id, tenantId, userId: user._id, suppressed: true }).lean()
      if (!link) return reply({ success: false, error: 'Связь не найдена' }, 404)
      restoreId = link._id
      eventId = link.eventId
    }
    const result = await syncGoogleAdditionalEvents(user, { eventId, restoreId })
    return reply({ success: true, data: result })
  } catch {
    return reply({ success: false, error: 'Синхронизация не завершена. Данные Ведело сохранены; повторите проверку.' }, 502)
  }
}
