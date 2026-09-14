import { sendExpoPushToTenant } from '@server/expoPushNotifications'
import SiteSettings from '@models/SiteSettings'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'

const toDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatDateLabel = (date) => {
  if (!date) return '--.--'
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  })
}

const formatTimeLabel = (date) => {
  if (!date) return '--:--'
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const buildTaskPushPayload = ({ event, task, triggerType, siteSettings }) => {
  const eventId = String(event?._id || '')
  const taskId = String(task?._id || '')
  const terminology = resolveWorkItemTerminology(siteSettings)
  const eventTitle = String(event?.eventType || terminology.labelCapitalized).trim() || terminology.labelCapitalized
  const taskTitle = String(task?.title || 'Задача').trim() || 'Задача'
  const taskDate = toDate(task?.date)

  let title = ''
  let body = ''
  let priority = 'high'
  let tag = ''

  switch (triggerType) {
    case 'task_created':
      title = 'Новая задача'
      body = `${taskTitle} • ${eventTitle}`
      if (taskDate) {
        body += ` • ${formatDateLabel(taskDate)} ${formatTimeLabel(taskDate)}`
      }
      priority = 'high'
      tag = `task-created-${eventId}-${Date.now()}`
      break

    case 'task_completed':
      title = 'Задача выполнена'
      body = `${taskTitle} • ${eventTitle}`
      priority = 'normal'
      tag = `task-completed-${eventId}-${Date.now()}`
      break

    case 'task_updated':
      title = 'Задача изменена'
      body = `${taskTitle} • ${eventTitle}`
      if (taskDate) {
        body += ` • ${formatDateLabel(taskDate)} ${formatTimeLabel(taskDate)}`
      }
      priority = 'high'
      tag = `task-updated-${eventId}-${Date.now()}`
      break

    case 'task_overdue':
      title = 'Просроченная задача'
      body = `${taskTitle} • ${eventTitle}`
      priority = 'high'
      tag = `task-overdue-${eventId}`
      break

    case 'task_tomorrow':
      title = 'Задача на завтра'
      body = `${taskTitle} • ${eventTitle} • ${formatTimeLabel(taskDate)}`
      priority = 'high'
      tag = `task-tomorrow-${eventId}`
      break

    default:
      title = 'Задача'
      body = `${taskTitle} • ${eventTitle}`
      tag = `task-${eventId}-${Date.now()}`
  }

  const deepLinkUrl = `/cabinet/eventsUpcoming?openEvent=${eventId}`

  return {
    title,
    body,
    data: {
      url: deepLinkUrl,
      eventId,
      taskId,
      type: `task_${triggerType}`,
      taskTitle,
      eventTitle,
    },
    priority,
    tag,
    categoryId: triggerType === 'task_completed' ? undefined : 'task-actions',
  }
}

const notifyTaskCreated = async ({ tenantId, event, task }) => {
  if (!tenantId || !event?._id || !task) return null
  const siteSettings = await SiteSettings.findOne({ tenantId }).select('custom').lean()
  const payload = buildTaskPushPayload({ event, task, triggerType: 'task_created', siteSettings })
  return sendExpoPushToTenant({ tenantId, payload })
}

const notifyTaskCompleted = async ({ tenantId, event, task }) => {
  if (!tenantId || !event?._id || !task) return null
  const siteSettings = await SiteSettings.findOne({ tenantId }).select('custom').lean()
  const payload = buildTaskPushPayload({ event, task, triggerType: 'task_completed', siteSettings })
  return sendExpoPushToTenant({ tenantId, payload })
}

const notifyTaskUpdated = async ({ tenantId, event, task }) => {
  if (!tenantId || !event?._id || !task) return null
  const siteSettings = await SiteSettings.findOne({ tenantId }).select('custom').lean()
  const payload = buildTaskPushPayload({ event, task, triggerType: 'task_updated', siteSettings })
  return sendExpoPushToTenant({ tenantId, payload })
}

export {
  buildTaskPushPayload,
  notifyTaskCreated,
  notifyTaskCompleted,
  notifyTaskUpdated,
}
