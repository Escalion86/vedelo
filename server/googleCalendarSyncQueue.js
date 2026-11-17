import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import Events from '@models/Events'
import GoogleCalendarDeletions from '@models/GoogleCalendarDeletions'
import Users from '@models/Users'
import { isGoogleTasksBeta } from '@helpers/googleTasksBeta.mjs'
import { deleteCalendarResourcesForWork, updateEventInCalendar } from '@server/CRUD'
import dbConnect from '@server/dbConnect'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { googleCalendarConnectionKey } from '@server/googleCalendarStableInsert.mjs'
import { googleImportUserFilter } from '@server/googleImportContext'
import { getUserCalendarId, normalizeCalendarSettings } from '@server/googleUserCalendarClient'

const leaseMs = 60_000
const attemptMs = 35_000
const retryDelayMs = [15_000, 60_000, 300_000]

class CalendarSyncChanged extends Error {}
class CalendarSyncUnavailable extends Error {}
class CalendarSyncConnectionRequired extends Error {}

export const getGoogleCalendarSyncAccount = async (userId, tenantId, suppressTasksBeta = false) => {
  if (!userId || !tenantId) return null
  await dbConnect()
  const account = await Users.findOne(googleImportUserFilter(userId, tenantId))
    .select('tenantId role googleCalendar').lean()
  return account && suppressTasksBeta
    ? { ...account, impersonation: { active: true } }
    : account
}

const getConnection = (user) => {
  if (!user?._id) return null
  const settings = normalizeCalendarSettings(user)
  if (!settings?.enabled || !settings?.refreshToken) return null
  const calendarId = getUserCalendarId(user)
  return { calendarId, key: googleCalendarConnectionKey(user, settings, calendarId) }
}

const getJob = ({ event, user, access }, now) => {
  if (!access?.allowCalendarSync || !event || (event.importedFromCalendar && !event.calendarImportChecked) ||
      (event.importedFromFile && !event.fileImportChecked)) return null
  const connection = getConnection(user)
  if (!connection) return null
  return {
    generation: randomUUID(),
    userId: user._id,
    connectionKey: connection.key,
    effectiveCalendarId: event.googleCalendarCalendarId || connection.calendarId,
    suppressTasksBeta: Boolean(user.impersonation?.active),
    attempts: 0,
    nextAttemptAt: now,
  }
}

const publicState = (status, error = '', now = new Date()) => ({
  calendarSyncStatus: status,
  calendarSyncError: error,
  calendarSyncUpdatedAt: now,
})

const taskReference = (item) => ({
  _id: item._id,
  googleCalendarEventId: item.googleCalendarEventId || '',
})

const syncsAsCalendarEvent = (task) => (
  task?.date && !task.done && task.googleSyncMode !== 'task' && task.googleSyncMode !== 'none'
)

export const getGoogleCalendarSyncCreateFields = (input) => {
  if (input.event?.importedFromCalendar) return {}
  const now = new Date()
  const job = getJob(input, now)
  return job ? { ...publicState('pending', '', now), calendarSyncJob: job } : {}
}

export const getGoogleCalendarSyncUpdate = (input) => {
  const now = new Date()
  const job = getJob(input, now)
  const wasPending = input.previousEvent?.calendarSyncStatus === 'pending'
  const set = job ? publicState('pending', '', now) : wasPending ? publicState('', '', now) : {}
  for (const [key, value] of Object.entries(job ?? {})) set[`calendarSyncJob.${key}`] = value
  const liveTasks = new Map((input.event?.additionalEvents ?? []).map((task) => [String(task._id), task]))
  const removed = (input.previousEvent?.additionalEvents ?? []).filter((task) => {
    if (!task._id || (!job && !wasPending && !task.googleCalendarEventId)) return false
    const next = liveTasks.get(String(task._id))
    return !next || (syncsAsCalendarEvent(task) && !syncsAsCalendarEvent(next))
  }).map(taskReference)
  const update = { $set: set }
  if (removed.length) update.$addToSet = { 'calendarSyncJob.removedTasks': { $each: removed } }
  return update
}

const availableLease = (field, now) => ({
  $or: [{ [field]: null }, { [field]: { $lte: now } }],
})

const eventJobFilter = (now) => ({
  calendarSyncStatus: 'pending',
  'calendarSyncJob.nextAttemptAt': { $lte: now },
  ...availableLease('calendarSyncJob.leaseUntil', now),
})

const calendarWriteOptions = () => ({
  timeout: 8_000,
  retry: false,
  signal: AbortSignal.timeout(attemptMs),
})

const getAttemptAccount = async ({ userId, tenantId, connectionKey, suppressTasksBeta }) => {
  const user = await getGoogleCalendarSyncAccount(userId, tenantId, suppressTasksBeta)
  if (!connectionKey || getConnection(user)?.key !== connectionKey) throw new CalendarSyncConnectionRequired()
  const access = await getUserTariffAccess(userId)
  if (!access?.allowCalendarSync) throw new CalendarSyncUnavailable()
  return user
}

const errorStatus = (error) => Number(error?.response?.status ?? error?.code)

const isTransient = (error) => {
  const status = errorStatus(error)
  const reason = error?.response?.data?.error?.errors?.[0]?.reason
  return status === 408 || status === 429 || status >= 500 ||
    ['rateLimitExceeded', 'userRateLimitExceeded', 'backendError'].includes(reason) ||
    ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ENETUNREACH', 'ETIMEDOUT', 'ABORT_ERR']
      .includes(error?.code ?? error?.cause?.code) ||
    ['AbortError', 'TimeoutError'].includes(error?.name)
}

const publicFailure = (error) => {
  if (error instanceof CalendarSyncUnavailable) return 'calendar_sync_unavailable'
  if (error instanceof CalendarSyncConnectionRequired || errorStatus(error) === 401 ||
      error?.response?.data?.error === 'invalid_grant') return 'calendar_sync_connection_required'
  return 'calendar_sync_failed'
}

export const runGoogleCalendarSync = async (tenantId, eventId, { connectionKey, generation } = {}) => {
  await dbConnect()
  const now = new Date()
  const leaseToken = randomUUID()
  const eventFilter = { _id: eventId, tenantId }
  const event = await Events.findOneAndUpdate(
    {
      ...eventFilter,
      ...eventJobFilter(now),
      ...(connectionKey ? { 'calendarSyncJob.connectionKey': connectionKey } : {}),
      ...(generation ? { 'calendarSyncJob.generation': generation } : {}),
    },
    { $set: {
      'calendarSyncJob.leaseToken': leaseToken,
      'calendarSyncJob.leaseUntil': new Date(now.getTime() + leaseMs),
    } },
    { returnDocument: 'after', timestamps: false }
  ).select('+calendarSyncJob').lean()
  if (!event) return 'busy'

  const job = event.calendarSyncJob
  const leaseFilter = { ...eventFilter, 'calendarSyncJob.leaseToken': leaseToken }
  const taskFilter = {
    ...leaseFilter,
    calendarSyncStatus: 'pending',
    'calendarSyncJob.generation': job.generation,
    syncVersion: event.syncVersion ?? null,
  }
  const options = calendarWriteOptions()
  const beforeWrite = async () => {
    options.signal.throwIfAborted()
    if (!await Events.exists({ ...taskFilter, 'calendarSyncJob.leaseUntil': { $gt: new Date() } })) {
      throw new CalendarSyncChanged()
    }
    await getAttemptAccount({ ...job, tenantId })
    options.signal.throwIfAborted()
  }
  try {
    const user = await getAttemptAccount({ ...job, tenantId })
    const result = await updateEventInCalendar(
      event,
      null,
      user,
      { _id: event._id, tenantId, additionalEvents: job.removedTasks },
      beforeWrite,
      { requestOptions: options, eventGuard: taskFilter },
    )
    if (result === undefined) throw new CalendarSyncConnectionRequired()
    const saved = await Events.updateOne(
      taskFilter,
      { $set: publicState(''), $unset: { calendarSyncJob: 1 } },
    )
    if (!saved.matchedCount) return 'obsolete'
    return result === null ? 'skipped' : 'synced'
  } catch (error) {
    if (error instanceof CalendarSyncChanged) return 'obsolete'
    const delay = retryDelayMs[job.attempts ?? 0]
    if (delay && isTransient(error)) {
      const saved = await Events.updateOne(taskFilter, {
        $set: { 'calendarSyncJob.nextAttemptAt': new Date(Date.now() + delay) },
        $inc: { 'calendarSyncJob.attempts': 1 },
      }, { timestamps: false })
      return saved.matchedCount ? 'retrying' : 'obsolete'
    }
    const saved = await Events.updateOne(taskFilter, { $set: publicState('failed', publicFailure(error)) })
    return saved.matchedCount ? 'failed' : 'obsolete'
  } finally {
    await Events.updateOne(leaseFilter, { $unset: {
      'calendarSyncJob.leaseToken': 1,
      'calendarSyncJob.leaseUntil': 1,
    } }, { timestamps: false })
  }
}

export const scheduleGoogleCalendarSync = (tenantId, eventId, options) => {
  after(async () => {
    try {
      const outcome = await runGoogleCalendarSync(tenantId, eventId, options)
      if (outcome === 'obsolete') await runGoogleCalendarSync(tenantId, eventId, options)
    } catch {
      console.error('Could not run queued Google Calendar sync')
    }
  })
}

export const prepareGoogleCalendarDeletion = async (event, user) => {
  const connection = getConnection(user)
  if (!connection || (!event.googleCalendarId && !event.calendarImportChecked && !event.importedFromCalendar &&
      !event.calendarSyncJob && !event.additionalEvents?.some((item) => item.googleCalendarEventId))) return false
  const now = Date.now()
  // A request already sent to Google might finish after the local deletion.
  const delay = event.calendarSyncStatus === 'pending' || event.calendarSyncJob?.leaseToken
    ? leaseMs : 0
  const filter = { tenantId: event.tenantId, eventId: event._id }
  const tasks = [...(event.additionalEvents ?? []), ...(event.calendarSyncJob?.removedTasks ?? [])]
    .filter((item) => item._id)
    .map(taskReference)
  await GoogleCalendarDeletions.updateOne(filter, {
    $set: {
      userId: user._id,
      connectionKey: connection.key,
      calendarId: event.googleCalendarCalendarId || event.calendarSyncJob?.effectiveCalendarId || connection.calendarId,
      googleCalendarId: event.googleCalendarId || '',
      tasks,
      tasksBeta: isGoogleTasksBeta(user),
      nextAttemptAt: new Date(now + delay),
      attempts: 0,
      expiresAt: new Date(now + 7 * 86_400_000),
    },
  }, { upsert: true })
  return true
}

const deletionFilter = (now) => ({ nextAttemptAt: { $lte: now }, ...availableLease('leaseUntil', now) })

export const runGoogleCalendarDeletion = async (tenantId, eventId) => {
  await dbConnect()
  const now = new Date()
  const eventFilter = { _id: eventId, tenantId }
  const leaseToken = randomUUID()
  const job = await GoogleCalendarDeletions.findOneAndUpdate(
    { tenantId, eventId, ...deletionFilter(now) },
    { $set: { leaseToken, leaseUntil: new Date(now.getTime() + leaseMs) } },
    { returnDocument: 'after' }
  ).lean()
  if (!job) return
  const filter = { _id: job._id, tenantId, eventId, leaseToken }
  try {
    if (await Events.exists(eventFilter)) {
      await GoogleCalendarDeletions.updateOne(filter, { $set: {
        nextAttemptAt: new Date(Date.now() + leaseMs),
      } })
      return
    }
    const user = await getAttemptAccount(job)
    const options = calendarWriteOptions()
    await deleteCalendarResourcesForWork(job, user, options, async () => {
      options.signal.throwIfAborted()
      if (await Events.exists(eventFilter) || !await GoogleCalendarDeletions.exists({
        ...filter,
        leaseUntil: { $gt: new Date() },
      })) throw new CalendarSyncChanged()
      await getAttemptAccount(job)
      options.signal.throwIfAborted()
    })
    await GoogleCalendarDeletions.deleteOne(filter)
  } catch (error) {
    const delay = retryDelayMs[job.attempts ?? 0]
    if (!delay || !isTransient(error)) {
      await GoogleCalendarDeletions.deleteOne(filter)
      return
    }
    await GoogleCalendarDeletions.updateOne(filter, {
      $set: { nextAttemptAt: new Date(Date.now() + delay) },
      $inc: { attempts: 1 },
    })
  } finally {
    await GoogleCalendarDeletions.updateOne(filter, { $unset: { leaseToken: 1, leaseUntil: 1 } })
  }
}

export const runDueGoogleCalendarJobs = async () => {
  await dbConnect()
  const now = new Date()
  const [syncJobs, deletions] = await Promise.all([
    Events.find(eventJobFilter(now)).sort({ 'calendarSyncJob.nextAttemptAt': 1 })
      .limit(8).select('_id tenantId').lean(),
    GoogleCalendarDeletions.find(deletionFilter(now)).sort({ nextAttemptAt: 1 })
      .limit(4).select('eventId tenantId').lean(),
  ])
  const operations = [
    ...syncJobs.map(({ tenantId, _id }) => () => runGoogleCalendarSync(tenantId, _id)),
    ...deletions.map(({ tenantId, eventId }) => () => runGoogleCalendarDeletion(tenantId, eventId)),
  ]
  for (let index = 0; index < operations.length; index += 3) {
    await Promise.allSettled(operations.slice(index, index + 3).map((run) => run()))
  }
}
