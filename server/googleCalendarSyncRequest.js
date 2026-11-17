import { NextResponse } from 'next/server'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { googleCalendarConnectionKey } from '@server/googleCalendarStableInsert.mjs'
import {
  getUserCalendarId,
  normalizeCalendarSettings,
} from '@server/googleUserCalendarClient'
import {
  getGoogleCalendarSyncAccount,
  getGoogleCalendarSyncUpdate,
  scheduleGoogleCalendarSync,
} from '@server/googleCalendarSyncQueue'

const errorResponse = (error, status) => ({
  errorResponse: NextResponse.json({ success: false, error }, { status }),
})

export const getCalendarSyncRequestAccess = async (req) => {
  const { tenantId, user } = await getRequestContext(req)
  if (!tenantId || !user?._id) return errorResponse('Не авторизован', 401)

  const access = await getUserTariffAccess(user._id)
  if (!access?.allowCalendarSync) return errorResponse('Синхронизация с календарём недоступна', 403)

  await dbConnect()
  const account = await getGoogleCalendarSyncAccount(user._id, tenantId, user.impersonation?.active)
  const settings = normalizeCalendarSettings(account)
  if (!settings.enabled || !settings.refreshToken) {
    return errorResponse('Подключите и включите Google Calendar', 409)
  }

  return {
    tenantId,
    access,
    account,
    connectionKey: googleCalendarConnectionKey(account, settings, getUserCalendarId(account)),
  }
}

export const enqueueCalendarSyncRequest = async (filter, { account, access, connectionKey }) => {
  const event = await Events.findOne(filter).select('+calendarSyncJob').lean()
  if (!event) return errorResponse('Мероприятие не найдено или не проверено', 404)

  if (
    event.calendarSyncStatus === 'pending' &&
    event.calendarSyncJob?.connectionKey === connectionKey
  ) return { event }

  const update = getGoogleCalendarSyncUpdate({ event, user: account, access })
  const queued = await Events.findOneAndUpdate(
    {
      ...filter,
      syncVersion: event.syncVersion ?? null,
      calendarSyncUpdatedAt: event.calendarSyncUpdatedAt ?? null,
      'calendarSyncJob.generation': event.calendarSyncJob?.generation ?? null,
    },
    update,
    { returnDocument: 'after' }
  ).select('+calendarSyncJob').lean()
  if (!queued) return errorResponse('Работа изменилась. Обновите карточку и повторите синхронизацию', 412)
  return { event: queued }
}

export const queueSavedEventCalendarSync = async ({ tenantId, user, access, event, previousEvent }) => {
  if (!user?._id || !event?._id) return event

  try {
    const calendarAccess = access ?? await getUserTariffAccess(user._id)
    if (!calendarAccess?.allowCalendarSync) return event
    const account = await getGoogleCalendarSyncAccount(user._id, tenantId, user.impersonation?.active)
    const update = getGoogleCalendarSyncUpdate({ event, previousEvent, user: account, access: calendarAccess })
    if (update.$set.calendarSyncStatus !== 'pending') return event

    const queued = await Events.findOneAndUpdate(
      { _id: event._id, tenantId, syncVersion: event.syncVersion ?? null },
      update,
      { returnDocument: 'after' }
    ).lean()
    if (queued) scheduleGoogleCalendarSync(tenantId, queued._id)
    return queued ?? event
  } catch {
    console.error('Не удалось поставить сохранённый заказ в очередь Google Calendar')
    return event
  }
}
