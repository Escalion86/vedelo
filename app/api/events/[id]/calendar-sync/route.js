import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { serializeCalendarSyncStatus } from '@server/calendarSyncStatus'
import { scheduleGoogleCalendarSync } from '@server/googleCalendarSyncQueue'
import {
  enqueueCalendarSyncRequest,
  getCalendarSyncRequestAccess,
} from '@server/googleCalendarSyncRequest'

export const POST = async (req, { params }) => {
  const context = await getCalendarSyncRequestAccess(req)
  if (context.errorResponse) return context.errorResponse

  const { id } = await params
  if (!mongoose.isObjectIdOrHexString(id)) {
    return NextResponse.json({ success: false, error: 'Неверный идентификатор заказа' }, { status: 400 })
  }

  const { event, errorResponse } = await enqueueCalendarSyncRequest({
    _id: id,
    tenantId: context.tenantId,
    $and: [
      { $or: [{ importedFromCalendar: { $ne: true } }, { calendarImportChecked: true }] },
      { $or: [{ importedFromFile: { $ne: true } }, { fileImportChecked: true }] },
    ],
  }, context)
  if (errorResponse) return errorResponse

  if (event.calendarSyncStatus === 'pending') {
    scheduleGoogleCalendarSync(context.tenantId, event._id)
  }
  return NextResponse.json({ success: true, data: serializeCalendarSyncStatus(event) })
}
