import { createHash } from 'node:crypto'

const stableKey = (...parts) => createHash('sha256').update(JSON.stringify(parts.map(String))).digest('hex')

export const googleCalendarConnectionKey = (user, settings, calendarId) =>
  stableKey(user._id, calendarId, settings.email || '', settings.connectedAt || '', settings.refreshToken || '')

export const googleCalendarResourceKey = (tenantId, calendarId, eventId, taskId = '') =>
  `vedelo${stableKey(tenantId, calendarId, eventId, taskId)}`

export const markGoogleCalendarResource = (resource, key) => ({
  ...resource,
  extendedProperties: {
    ...resource.extendedProperties,
    private: { ...resource.extendedProperties?.private, vedeloKey: key },
  },
})

export async function insertOrReadGoogleCalendarResource(events, calendarId, resource, key, beforeWrite) {
  const marked = markGoogleCalendarResource(resource, key)
  if (beforeWrite) await beforeWrite()
  try {
    return await events.insert({ calendarId, resource: { ...marked, id: key } })
  } catch (error) {
    if (Number(error?.response?.status ?? error?.code) !== 409) throw error
    const existing = await events.get({ calendarId, eventId: key })
    if (existing?.data?.id !== key || existing.data.extendedProperties?.private?.vedeloKey !== key) throw error
    const restored = existing.data.status === 'cancelled' ? { ...marked, status: 'confirmed' } : marked
    if (beforeWrite) await beforeWrite()
    return events.update({ calendarId, eventId: key, resource: restored })
  }
}
