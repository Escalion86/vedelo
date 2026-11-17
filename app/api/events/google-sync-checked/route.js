import { NextResponse } from 'next/server'
import Events from '@models/Events'
import mongoose from 'mongoose'
import { runGoogleCalendarSync } from '@server/googleCalendarSyncQueue'
import {
  enqueueCalendarSyncRequest,
  getCalendarSyncRequestAccess,
} from '@server/googleCalendarSyncRequest'

const checkedWork = {
  calendarImportChecked: true,
  $or: [{ importedFromFile: { $ne: true } }, { fileImportChecked: true }],
}

export const GET = async (req) => {
  const { tenantId, connectionKey, errorResponse } = await getCalendarSyncRequestAccess(req)
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
  const context = await getCalendarSyncRequestAccess(req)
  const { tenantId, connectionKey, errorResponse } = context
  if (errorResponse) return errorResponse

  const body = await req.json().catch(() => ({}))
  const eventId = String(body?.eventId ?? '').trim()
  if (!mongoose.isObjectIdOrHexString(eventId)) {
    return NextResponse.json(
      { success: false, error: 'Не указан eventId' },
      { status: 400 }
    )
  }
  if (body?.connectionKey !== undefined && body.connectionKey !== connectionKey) return NextResponse.json(
    { success: false, error: 'Подключение календаря изменилось' }, { status: 409 }
  )

  const queued = await enqueueCalendarSyncRequest({
    _id: eventId,
    tenantId,
    ...checkedWork,
  }, context)
  if (queued.errorResponse) return queued.errorResponse

  const result = queued.event.calendarSyncStatus === 'pending'
    ? await runGoogleCalendarSync(tenantId, eventId, {
        connectionKey,
        generation: queued.event.calendarSyncJob?.generation,
      })
    : 'skipped'
  if (result === 'synced' || result === 'skipped') {
    return NextResponse.json({ success: true, data: { eventId } })
  }
  const [error, status] = {
    retrying: ['Запланирован повтор синхронизации', 503],
    busy: ['Синхронизация уже выполняется', 412],
    obsolete: ['Данные или подключение изменились. Обновите список', 412],
  }[result] ?? ['Ошибка синхронизации мероприятия', 500]
  return NextResponse.json({ success: false, error }, { status })
}
