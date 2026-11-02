import Calls from '@models/Calls'
import Events from '@models/Events'
import Clients from '@models/Clients'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { updateEventInCalendar } from '@server/CRUD'
import { saveAndroidCallResult, serializeAndroidCallResult } from '@server/androidCallResult.mjs'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'

export const GET = async req => {
  const context = await getRequestContext(req)
  if (!context.tenantId || !context.user?._id) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  const rows = await Calls.find({ tenantId: context.tenantId, provider: 'android' }).sort({ callResultAt: -1, _id: -1 }).limit(100).lean()
  return mobileSuccess(rows.map(serializeAndroidCallResult))
}
export const POST = async req => {
  try {
    const context = await getRequestContext(req)
    if (!context.tenantId || !context.user?._id || context.user.archive) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
    const body = await req.json().catch(() => null)
    await dbConnect()
    const { call, event } = await saveAndroidCallResult({ Calls, Events, Clients, tenantId: String(context.tenantId), userId: String(context.user._id), body })
    if (event && body.nextContactAt) {
      try {
        const access = await getUserTariffAccess(context.user._id)
        if (access?.allowCalendarSync) await updateEventInCalendar(event, req, context.user)
      } catch {
        await Events.updateOne({ _id: event._id, tenantId: context.tenantId }, { $set: { calendarSyncError: 'calendar_sync_failed' } })
      }
    }
    return mobileSuccess(serializeAndroidCallResult(call))
  } catch (error) {
    return mobileError(error.notSaved || error.status === 400 ? 'ANDROID_RESULT_REJECTED' : 'ANDROID_RESULT_UNCONFIRMED', error.status ? error.message : 'Результат не подтверждён. Повторите ту же попытку.', error.status || 503)
  }
}
