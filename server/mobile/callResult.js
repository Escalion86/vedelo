import Calls from '@models/Calls'
import Events from '@models/Events'
import Histories from '@models/Histories'
import dbConnect from '@server/dbConnect'
import { queueSavedEventCalendarSync } from '@server/googleCalendarSyncRequest'
import { requireTelephonyTariffAccess } from '@server/telephonyAccess'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import { normalizeMobileCallResult, serializeMobileCall } from '@server/mobile/calls'

const parseNextContactAt = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export const handleMobileCallResult = async (req, { params }) => {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const result = normalizeMobileCallResult(body.result)
  if (!result) {
    return mobileError('CALL_RESULT_INVALID', 'Выберите результат звонка', 400)
  }

  const nextContactAt = parseNextContactAt(body.nextContactAt)
  if (nextContactAt === undefined) {
    return mobileError('NEXT_CONTACT_DATE_INVALID', 'Некорректная дата следующего контакта', 400)
  }

  const accessResult = await requireTelephonyTariffAccess(req)
  if (!accessResult.ok) {
    return mobileError(
      accessResult.status === 401 ? 'UNAUTHORIZED' : 'TARIFF_REQUIRED',
      accessResult.error,
      accessResult.status
    )
  }

  const { tenantId, user, access } = accessResult
  await dbConnect()
  const existingCall = await Calls.findOne({ _id: id, tenantId }).lean()
  if (!existingCall) return mobileError('CALL_NOT_FOUND', 'Звонок не найден', 404)

  const linkedEventId = body.eventId || existingCall.linkedEventId || null
  let event = null
  let task = null
  if (nextContactAt) {
    if (!linkedEventId) {
      return mobileError(
        'EVENT_REQUIRED',
        'Чтобы запланировать контакт, сначала привяжите звонок к заявке или мероприятию',
        409
      )
    }
    const nextTask = {
      title: String(body.nextContactTitle || (result === 'no_answer' ? 'Перезвонить клиенту' : 'Следующий контакт')).trim().slice(0, 200),
      description: String(body.note || '').trim().slice(0, 1000),
      date: nextContactAt,
      done: false,
      doneAt: null,
      googleCalendarEventId: '',
    }
    event = await Events.findOneAndUpdate(
      { _id: linkedEventId, tenantId },
      { $push: { additionalEvents: nextTask }, $inc: { syncVersion: 1 } },
      { returnDocument: 'after' }
    ).lean()
    if (!event) return mobileError('EVENT_NOT_FOUND', 'Мероприятие не найдено', 404)
    task = event.additionalEvents?.[event.additionalEvents.length - 1] || nextTask

    try {
      await Histories.create({
        schema: Events.collection.collectionName,
        action: 'update',
        data: [event],
        userId: String(user._id),
      })
    } catch (error) {
      console.error('[mobile/calls/result] history failed', {
        callId: String(id),
        eventId: String(linkedEventId),
        message: error?.message,
      })
    }

    event = await queueSavedEventCalendarSync({ tenantId, user, access, event })
  }

  const call = await Calls.findOneAndUpdate(
    { _id: id, tenantId },
    {
      $set: {
        callResult: result,
        callResultNote: String(body.note || '').trim().slice(0, 1000),
        callResultAt: new Date(),
        ...(linkedEventId ? { linkedEventId, status: 'linked' } : {}),
      },
    },
    { returnDocument: 'after' }
  ).lean()

  return mobileSuccess({
    call: serializeMobileCall(call),
    event: event
      ? { _id: String(event._id), syncVersion: event.syncVersion }
      : null,
    task: task
      ? {
          _id: task._id ? String(task._id) : null,
          title: task.title,
          description: task.description,
          date: task.date,
          done: Boolean(task.done),
        }
      : null,
  })
}
