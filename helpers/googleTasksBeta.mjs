export const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks'
export const isGoogleTasksDeveloper = (user) =>
  user?.role === 'dev' && !user?.impersonation?.active
export const isGoogleTasksBeta = (user) =>
  isGoogleTasksDeveloper(user) && user?.googleCalendar?.tasksBeta?.enabled === true
export const hasGoogleTasksScope = (user) =>
  String(user?.googleCalendar?.scope || '').split(/\s+/).includes(GOOGLE_TASKS_SCOPE)
export const normalizeGoogleTaskMode = (value, fallback = 'event') =>
  ['event', 'task', 'none'].includes(value) ? value : fallback
export const normalizeGoogleTaskDuration = (value) =>
  Number.isInteger(Number(value)) && Number(value) >= 5 && Number(value) <= 1440
    ? Number(value) : 30

// Provider IDs are never accepted from an untrusted form. Match only records
// already belonging to the event read using the authenticated tenant.
export const additionalGoogleFields = (item, previous, user) => {
  const old = previous.find((entry) => item._id && String(entry._id) === String(item._id))
    || previous.find((entry) => item.googleCalendarEventId &&
      entry.googleCalendarEventId === item.googleCalendarEventId)
  return {
    ...(old?._id ? { _id: old._id } : {}),
    googleCalendarEventId: old?.googleCalendarEventId || '',
    googleSyncMode: isGoogleTasksBeta(user)
      ? normalizeGoogleTaskMode(item.googleSyncMode,
          old?.googleSyncMode || (old ? 'event' : normalizeGoogleTaskMode(user.googleCalendar.tasksBeta.defaultMode)))
      : normalizeGoogleTaskMode(old?.googleSyncMode),
    googleDurationMinutes: isGoogleTasksBeta(user)
      ? normalizeGoogleTaskDuration(item.googleDurationMinutes ?? old?.googleDurationMinutes)
      : normalizeGoogleTaskDuration(old?.googleDurationMinutes),
  }
}

export const googleTaskDue = (date, timeZone) => {
  if (!date || Number.isNaN(new Date(date).getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(date))
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}T00:00:00.000Z`
}
