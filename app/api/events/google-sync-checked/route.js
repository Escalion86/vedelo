import { NextResponse } from 'next/server'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import { updateEventInCalendar } from '@server/CRUD'
import mongoose from 'mongoose'
import Users from '@models/Users'
import getRequestContext from '@server/getRequestContext'
import { googleImportUserFilter } from '@server/googleImportContext'
import { getUserCalendarId, normalizeCalendarSettings } from '@server/googleUserCalendarClient'
import { googleCalendarConnectionKey } from '@server/googleCalendarStableInsert.mjs'
import getUserTariffAccess from '@server/getUserTariffAccess'

const checkedWork = {
  calendarImportChecked: true,
  $or: [{ importedFromFile: { $ne: true } }, { fileImportChecked: true }],
}

class CheckedSyncChanged extends Error {
  constructor(response) {
    super('Calendar sync prerequisites changed')
    this.response = response
  }
}

const checkAccess = async (req) => {
  const { tenantId, user } = await getRequestContext(req)
  if (!tenantId || !user?._id) {
    return { errorResponse: NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    ) }
  }

  const access = await getUserTariffAccess(user._id)
  if (!access?.allowCalendarSync) {
    return { errorResponse: NextResponse.json(
      { success: false, error: 'Синхронизация с календарем недоступна' },
      { status: 403 }
    ) }
  }
  await dbConnect()
  const owner = await Users.findOne(googleImportUserFilter(user._id, tenantId)).lean()
  const settings = normalizeCalendarSettings(owner)
  if (!owner || !settings.enabled || !settings.refreshToken) return { errorResponse: NextResponse.json(
    { success: false, error: 'Подключите и включите Google Calendar' }, { status: 409 }
  ) }
  return { tenantId, user: owner, connectionKey: googleCalendarConnectionKey(owner, settings, getUserCalendarId(owner)) }
}

export const GET = async (req) => {
  const { tenantId, connectionKey, errorResponse } = await checkAccess(req)
  if (errorResponse) return errorResponse

  const events = await Events.find(
    { tenantId, ...checkedWork },
    { _id: 1, eventType: 1, status: 1, eventDate: 1 }
  )
    .sort({ eventDate: 1, createdAt: 1 })
    .lean()

  return NextResponse.json(
    {
      success: true,
      data: {
        total: events.length,
        connectionKey,
        events: events.map((event) => ({
          _id: event._id,
          title: event?.eventType || 'Мероприятие',
          status: event?.status || 'active',
        })),
      },
    },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

export const POST = async (req) => {
  const { tenantId, user, connectionKey, errorResponse } = await checkAccess(req)
  if (errorResponse) return errorResponse

  const body = await req.json().catch(() => ({}))
  const eventId = String(body?.eventId ?? '').trim()
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return NextResponse.json(
      { success: false, error: 'Не указан eventId' },
      { status: 400 }
    )
  }
  if (body?.connectionKey !== undefined && body.connectionKey !== connectionKey) return NextResponse.json(
    { success: false, error: 'Подключение календаря изменилось' }, { status: 409 }
  )

  const filter = {
    _id: eventId,
    tenantId,
    ...checkedWork,
  }
  const event = await Events.findOne(filter)
  if (!event) {
    return NextResponse.json(
      { success: false, error: 'Мероприятие не найдено или не проверено' },
      { status: 404 }
    )
  }

  const revisionFilter = { ...filter, syncVersion: event.syncVersion ?? null }
  const beforeWrite = async () => {
    const latest = await checkAccess(req)
    if (latest.errorResponse) throw new CheckedSyncChanged(latest.errorResponse)
    if (String(latest.tenantId) !== String(tenantId) || latest.connectionKey !== connectionKey) {
      throw new CheckedSyncChanged(NextResponse.json(
        { success: false, error: 'Подключение календаря изменилось' }, { status: 409 }
      ))
    }
    if (!await Events.exists(revisionFilter)) throw new CheckedSyncChanged(NextResponse.json(
      { success: false, error: 'Работа изменилась или снята отметка. Обновите список.' }, { status: 412 }
    ))
  }
  try {
    const result = await updateEventInCalendar(event, req, user, null, beforeWrite)
    if (result === undefined) throw Error('Google Calendar unavailable')
    await Events.updateOne(revisionFilter, {
      calendarSyncError: '',
    })
    return NextResponse.json(
      { success: true, data: { eventId: event._id } },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof CheckedSyncChanged) return error.response
    await Events.updateOne(revisionFilter, {
      calendarSyncError: 'calendar_sync_failed',
    })
    console.error('Google Calendar checked sync failed', Number(error?.response?.status ?? error?.code) || 'unknown')
    return NextResponse.json(
      { success: false, error: 'Ошибка синхронизации мероприятия' },
      { status: 500 }
    )
  }
}
