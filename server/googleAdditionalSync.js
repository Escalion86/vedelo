import { buildGoogleTaskContext, buildGoogleTaskNotes } from '@server/googleEventDescription'
import crypto from 'node:crypto'
import { google } from 'googleapis'
import Events from '@models/Events'
import SiteSettings from '@models/SiteSettings'
import Links from '@models/GoogleAdditionalLinks'
import dbConnect from '@server/dbConnect'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { getUserOAuthClient, getUserCalendarClient, normalizeCalendarReminders } from '@server/googleUserCalendarClient'
import { getCanonicalBaseUrl } from '@helpers/brand.mjs'
import { isGoogleTasksBeta, hasGoogleTasksScope, googleTaskDue,
  normalizeGoogleTaskMode, normalizeGoogleTaskDuration } from '@helpers/googleTasksBeta.mjs'

const requestOptions = { timeout: 10000, retry: false }
const isMissing = (error) => [404, 410].includes(Number(error?.code || error?.response?.status))
export const getGoogleTasksClient = (user) => google.tasks({
  version: 'v1', auth: getUserOAuthClient(user),
})

export const listGoogleTaskLists = async (user) => {
  const client = getGoogleTasksClient(user)
  const lists = []
  let pageToken
  do {
    const { data } = await client.tasklists.list({ maxResults: 100, pageToken }, requestOptions)
    lists.push(...(data.items || []).map(({ id, title }) => ({ id, title })))
    pageToken = data.nextPageToken
  } while (pageToken && lists.length < 1000)
  return lists
}

// A persisted marker lets a retry find a task after a lost insert response.
// If the outcome is still unknown we stop, rather than silently insert a duplicate.
export const reconcileAdditionalLink = async ({ link, item, event, timeZone, calendarId,
  taskListId, calendar, tasks, save, applyDone, reminders, taskContext, restore = false }) => {
  const mode = item ? normalizeGoogleTaskMode(item.googleSyncMode) : 'none'
  const wanted = mode === 'task' || (mode === 'event' && item?.date && !item.done)
  const target = link.remoteId && link.kind === mode ? link.containerId : mode === 'task' ? taskListId : calendarId
  const remove = async () => {
    if (!link.remoteId) return
    try {
      if (link.kind === 'task') await tasks.tasks.delete({ tasklist: link.containerId, task: link.remoteId }, requestOptions)
      else await calendar.events.delete({ calendarId: link.containerId, eventId: link.remoteId }, requestOptions)
    } catch (error) { if (!isMissing(error)) throw error }
    link.remoteId = ''
    link.marker = crypto.randomBytes(16).toString('hex')
    link.fingerprint = ''
    await save()
  }
  const recover = async () => {
    if (!link.pendingCreate) return
    if (link.kind === 'event') {
      try {
        const { data } = await calendar.events.get({ calendarId: link.containerId, eventId: link.marker }, requestOptions)
        if (data.status !== 'cancelled') link.remoteId = data.id
        else { link.suppressed = true; link.error = 'deleted_in_google' }
      } catch (error) { if (!isMissing(error)) throw error }
      // Calendar supports caller-supplied IDs: repeating the same ID is safe.
      link.pendingCreate = false
    } else {
      let pageToken
      let pages = 0
      do {
        const { data } = await tasks.tasks.list({ tasklist: link.containerId, maxResults: 100,
          showCompleted: true, showHidden: true, pageToken }, requestOptions)
        const matches = (data.items || []).filter((entry) => entry.notes?.includes(`[vedelo:${link.marker}]`))
        if (matches.length > 1) throw new Error('ambiguous_create')
        if (matches.length === 1) { link.remoteId = matches[0].id; link.pendingCreate = false; break }
        pageToken = data.nextPageToken
      } while (pageToken && ++pages < 5)
      if (link.pendingCreate) throw new Error('unknown_create')
    }
    await save()
  }
  await recover()
  if (!wanted) {
    await remove()
    link.suppressed = false
    link.error = ''
    await save()
    return
  }
  if (!target) throw new Error('select_task_list')
  if (link.remoteId && (link.kind !== mode || link.containerId !== target)) await remove()
  if (restore || link.kind !== mode) {
    link.suppressed = false
    link.marker = crypto.randomBytes(16).toString('hex')
    await save()
  }
  if (link.suppressed) return
  link.kind = mode
  link.containerId = target
  let remote
  if (link.remoteId) {
    try {
      const response = mode === 'task'
        ? await tasks.tasks.get({ tasklist: target, task: link.remoteId }, requestOptions)
        : await calendar.events.get({ calendarId: target, eventId: link.remoteId }, requestOptions)
      remote = response.data
      if (remote.deleted || remote.status === 'cancelled') throw Object.assign(new Error('deleted'), { code: 404 })
    } catch (error) {
      if (!isMissing(error)) throw error
      link.remoteId = ''
      link.suppressed = true
      link.error = 'deleted_in_google'
      await save()
      return
    }
  }
  // CRM wins a simultaneous edit; otherwise pull only the completion flag.
  if (mode === 'task' && remote && Boolean(item.done) === link.lastDone &&
      (remote.status === 'completed') !== link.lastDone) {
    const done = remote.status === 'completed'
    if (!await applyDone(done, remote.completed)) throw new Error('local_conflict')
    item = { ...item, done, doneAt: done ? remote.completed || new Date() : null }
  }
  const notes = mode === 'task' && taskContext ? buildGoogleTaskNotes(item, taskContext, link.marker) : `${String(item.description || '').slice(0, 6500)}\n\n${getCanonicalBaseUrl()}/cabinet/eventsUpcoming?openEvent=${event._id}\n[vedelo:${link.marker}]`
  const body = mode === 'task' ? {
    title: (item.title || 'Задача').slice(0, 1024), notes: notes.slice(0, 8192),
    due: googleTaskDue(item.date, timeZone), status: item.done ? 'completed' : 'needsAction',
    completed: item.done ? new Date(item.doneAt || Date.now()).toISOString() : null,
  } : {
    summary: item.title || 'Доп. событие', description: notes,
    reminders: reminders || { useDefault: true },
    start: { dateTime: new Date(item.date).toISOString(), timeZone },
    end: { dateTime: new Date(new Date(item.date).getTime() + normalizeGoogleTaskDuration(item.googleDurationMinutes) * 60000).toISOString(), timeZone },
  }
  const fingerprint = JSON.stringify(body)
  if (!link.remoteId) {
    link.pendingCreate = true
    await save()
    let response
    try {
      if (mode === 'task') response = await tasks.tasks.insert({ tasklist: target, requestBody: body }, requestOptions)
      else response = await calendar.events.insert({ calendarId: target, requestBody: { ...body, id: link.marker } }, requestOptions)
    } catch (error) {
      const code = Number(error.code || error.response?.status)
      if ([400, 401, 403, 404, 429].includes(code)) {
        link.pendingCreate = false
        await save()
      }
      throw error
    }
    if (!response?.data?.id) throw new Error('unknown_create')
    link.remoteId = response.data.id
    link.pendingCreate = false
  } else if (link.fingerprint !== fingerprint) {
    if (mode === 'task') await tasks.tasks.patch({ tasklist: target, task: link.remoteId, requestBody: body }, requestOptions)
    else await calendar.events.patch({ calendarId: target, eventId: link.remoteId, requestBody: body }, requestOptions)
  }
  link.fingerprint = fingerprint
  link.lastDone = Boolean(item.done)
  link.error = ''
  await save()
}

export const syncGoogleAdditionalEvents = async (user, { eventId, restoreId, previousEvent } = {}) => {
  if (!isGoogleTasksBeta(user) || !user.googleCalendar?.enabled || !user.googleCalendar?.refreshToken) return { changed: false, errors: [] }
  if (!(await getUserTariffAccess(user._id))?.allowCalendarSync) return { changed: false, errors: [] }
  const tenantId = String(user.tenantId || user._id)
  const userId = user._id
  await dbConnect()
  const filter = { tenantId, ...(eventId ? { _id: eventId } : {}) }
  const events = await Events.find(filter).select('additionalEvents googleCalendarCalendarId importedFromFile fileImportChecked importedFromCalendar calendarImportChecked syncVersion').lean()
  const settings = await SiteSettings.findOne({ tenantId }).select('timeZone custom').lean()
  const timeZone = settings?.timeZone || 'Asia/Krasnoyarsk'
  const calendar = getUserCalendarClient(user)
  const tasks = hasGoogleTasksScope(user) ? getGoogleTasksClient(user) : null
  const scope = { tenantId, userId, ...(eventId ? { eventId } : {}) }
  const eventMap = new Map(events.map((event) => [String(event._id), event]))
  const seeds = [...events]
  if (previousEvent && String(previousEvent.tenantId) === tenantId && String(previousEvent._id) === String(eventId)) seeds.push(previousEvent)
  for (const event of seeds) {
    if ((event.importedFromFile && !event.fileImportChecked) || (event.importedFromCalendar && !event.calendarImportChecked)) continue
    for (const item of event.additionalEvents || []) {
      if (!item._id) continue
      const key = { tenantId, userId, eventId: event._id, taskId: item._id }
      await Links.updateOne(key, { $setOnInsert: {
        ...key, marker: crypto.randomBytes(16).toString('hex'),
        remoteId: item.googleCalendarEventId || '', kind: 'event',
        containerId: event.googleCalendarCalendarId || user.googleCalendar.calendarId || 'primary',
        lastDone: Boolean(item.done), createdAt: new Date(), updatedAt: new Date(),
      } }, { upsert: true, timestamps: false })
    }
  }
  // Oldest first: bounded batches make progress even with many historical tasks.
  const links = await Links.find({ ...scope, ...(restoreId ? { _id: restoreId } : {}) }).sort({ updatedAt: 1 }).limit(eventId ? 100 : 20).lean()
  let changed = false
  const errors = []
  for (const snapshot of links) {
    const token = crypto.randomUUID()
    const link = await Links.findOneAndUpdate({ ...scope, _id: snapshot._id,
      $or: [{ lockUntil: null }, { lockUntil: { $lt: new Date() } }] },
    { $set: { lockToken: token, lockUntil: new Date(Date.now() + 120000) } }, { returnDocument: 'after' }).lean()
    if (!link) continue
    const key = { ...scope, _id: link._id, lockToken: token }
    const save = async () => {
      const { _id, __v, createdAt, updatedAt, ...values } = link
      const result = await Links.updateOne(key, { $set: values })
      if (!result.matchedCount) throw new Error('sync_conflict')
    }
    try {
      // Re-read after acquiring the lease. Never mutate from a stale listing.
      const event = await Events.findOne({ _id: link.eventId, tenantId }).lean()
      if (event && ((event.importedFromFile && !event.fileImportChecked) || (event.importedFromCalendar && !event.calendarImportChecked))) continue
      const item = event?.additionalEvents?.find((entry) => String(entry._id) === String(link.taskId))
      if ((link.kind === 'task' || item?.googleSyncMode === 'task') && !tasks) throw new Error('tasks_permission_required')
      await reconcileAdditionalLink({ link, item, event: event || eventMap.get(String(link.eventId)) || { _id: link.eventId },
        timeZone, calendarId: event?.googleCalendarCalendarId || user.googleCalendar.calendarId || 'primary',
        taskContext: item?.googleSyncMode === 'task' ? await buildGoogleTaskContext(event, user, settings) : undefined,
        reminders: normalizeCalendarReminders(user.googleCalendar.reminders),
        taskListId: user.googleCalendar.tasksBeta.taskListId, calendar, tasks, save,
        restore: String(restoreId || '') === String(link._id),
        applyDone: async (done, completed) => {
          const result = await Events.updateOne({ _id: link.eventId, tenantId,
            additionalEvents: { $elemMatch: { _id: link.taskId, done: Boolean(item.done), date: item.date,
              googleSyncMode: 'task' } } }, {
            $set: { 'additionalEvents.$.done': done, 'additionalEvents.$.doneAt': done ? new Date(completed || Date.now()) : null },
            $inc: { syncVersion: 1 },
          })
          changed ||= result.modifiedCount > 0
          return result.modifiedCount > 0
        },
      })
    } catch (error) {
      const known = ['select_task_list', 'unknown_create', 'ambiguous_create', 'local_conflict', 'tasks_permission_required']
      link.error = known.includes(error.message) ? error.message : 'google_sync_failed'
      await save()
    } finally {
      await Links.updateOne(key, { $set: { lockToken: '', lockUntil: null } })
    }
    if (link.error) errors.push({ id: String(link._id), eventId: String(link.eventId), error: link.error })
  }
  return { changed, errors }
}
