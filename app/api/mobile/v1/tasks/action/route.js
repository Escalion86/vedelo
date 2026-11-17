import { NextResponse } from 'next/server'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { queueSavedEventCalendarSync } from '@server/googleCalendarSyncRequest'
import { recordActivityHistory } from '@server/activityHistory'
import compareObjectsWithDif from '@helpers/compareObjectsWithDif'
import {
  notifyTaskCompleted,
  notifyTaskUpdated,
} from '@server/taskPushNotifications'
import { applyTaskAction, isTaskAction } from '@server/mobile/taskActions'

export const POST = async (request) => {
  const context = await getRequestContext(request)
  const { tenantId, user } = context
  if (!tenantId || !user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const access = await getUserTariffAccess(user._id)
  if (!access?.trialActive && !access?.hasTariff) {
    return NextResponse.json(
      { success: false, error: 'Не выбран тариф' },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const eventId = String(body?.eventId || '').trim()
  const taskId = String(body?.taskId || '').trim()
  const action = String(body?.action || '').trim()
  if (!eventId || !taskId || !isTaskAction(action)) {
    return NextResponse.json(
      { success: false, error: 'Некорректное действие с задачей' },
      { status: 400 }
    )
  }

  await dbConnect()
  const event = await Events.findOne({ _id: eventId, tenantId })
  if (!event) {
    return NextResponse.json(
      { success: false, error: 'Мероприятие не найдено' },
      { status: 404 }
    )
  }

  const oldEvent = event.toObject()
  const task = event.additionalEvents?.id(taskId)
  if (!task) {
    return NextResponse.json(
      { success: false, error: 'Задача не найдена' },
      { status: 404 }
    )
  }

  applyTaskAction(task, action)
  event.syncVersion = Number(event.syncVersion || 1) + 1
  await event.save()
  const changes = compareObjectsWithDif(oldEvent, event.toObject())
  if (Object.keys(changes).length > 0)
    await recordActivityHistory({
      req: request,
      context,
      entityType: 'event',
      entityId: event._id,
      operation: 'update',
      before: oldEvent,
      after: event.toObject(),
      semanticAction:
        action === 'complete'
          ? 'task_completed'
          : action === 'tomorrow' || action === 'plus3days'
            ? 'task_rescheduled'
            : 'task_updated',
    })

  await queueSavedEventCalendarSync({ tenantId, user, access, event, previousEvent: oldEvent })

  const updatedTask = event.additionalEvents?.id(taskId)
  const notify = action === 'complete' ? notifyTaskCompleted : notifyTaskUpdated
  await notify({ tenantId, event, task: updatedTask }).catch(() => null)

  return NextResponse.json({
    success: true,
    data: {
      eventId: String(event._id),
      task: updatedTask?.toObject?.() || updatedTask,
      syncVersion: event.syncVersion,
    },
  })
}
