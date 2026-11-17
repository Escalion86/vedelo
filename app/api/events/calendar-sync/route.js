import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import {
  calendarSyncStatusProjection,
  serializeCalendarSyncStatus,
} from '@server/calendarSyncStatus'

export const GET = async (req) => {
  const { tenantId, user } = await getRequestContext(req)
  if (!tenantId || !user?._id) {
    return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })
  }

  const ids = new URL(req.url).searchParams.get('ids')?.split(',') ?? []
  if (!ids.length || ids.length > 50 || ids.some((id) => !mongoose.isObjectIdOrHexString(id))) {
    return NextResponse.json({ success: false, error: 'Укажите от 1 до 50 идентификаторов' }, { status: 400 })
  }

  await dbConnect()
  const events = await Events.find({ tenantId, _id: { $in: ids } }, calendarSyncStatusProjection).lean()
  return NextResponse.json(
    { success: true, data: events.map(serializeCalendarSyncStatus) },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
