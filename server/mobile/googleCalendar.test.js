import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearGoogleCalendarCredentials,
  serializeMobileGoogleCalendar,
  normalizeMobileGoogleCalendarPatch,
} from './googleCalendar.js'

test('mobile Google Calendar status не раскрывает OAuth credentials', () => {
  const result = serializeMobileGoogleCalendar({
    enabled: true,
    calendarId: 'primary',
    calendarName: 'Рабочий',
    refreshToken: 'refresh-secret',
    accessToken: 'access-secret',
    scope: 'secret-scope',
    syncToken: 'sync-secret',
  }, { allowCalendarSync: true })
  assert.equal(result.connected, true)
  assert.equal(result.calendarName, 'Рабочий')
  const json = JSON.stringify(result)
  assert.equal(json.includes('refresh-secret'), false)
  assert.equal(json.includes('access-secret'), false)
  assert.equal(json.includes('sync-secret'), false)
})

test('partial calendar settings do not replace PWA settings or credentials', () => {
  assert.deepEqual(normalizeMobileGoogleCalendarPatch({ syncSettings: { showClient: false }, statusColors: { draft: '2' } }), {
    'googleCalendar.syncSettings.showClient': false, 'googleCalendar.statusColors.draft': '2',
  })
  assert.deepEqual(normalizeMobileGoogleCalendarPatch({ enabled: false }), { 'googleCalendar.enabled': false })
})
test('rejects identities, credentials, Mongo fields and invalid nested settings', () => {
  for (const body of [{ tenantId: 'other' }, { accessToken: 'secret' }, { enabled: 'false' }, { statusColors: { draft: '12' } }, { syncSettings: { showClient: 'false' } }, { syncSettings: { titleMode: 'unknown' } }, { syncSettings: { $set: {} } }, []]) assert.throws(() => normalizeMobileGoogleCalendarPatch(body))
})
test('reminders respect provider limits and keep an explicit empty default list', () => {
  assert.deepEqual(normalizeMobileGoogleCalendarPatch({ reminders: { useDefault: true, overrides: [] } }), { 'googleCalendar.reminders': { useDefault: true, overrides: [] } })
  for (const overrides of [[], [{ method: 'popup', minutes: 40321 }], [{ method: 'popup', minutes: 1.5 }], Array.from({ length: 6 }, () => ({ method: 'popup', minutes: 60 }))]) assert.throws(() => normalizeMobileGoogleCalendarPatch({ reminders: { useDefault: false, overrides } }))
})

test('отключение очищает токены, календарь и email', () => {
  const user = {
    googleCalendar: {
      enabled: true,
      calendarId: 'private-calendar',
      calendarName: 'Личный',
      refreshToken: 'refresh-secret',
      accessToken: 'access-secret',
      syncToken: 'sync-secret',
      email: 'private@example.test',
    },
  }
  clearGoogleCalendarCredentials(user)
  assert.equal(user.googleCalendar.enabled, false)
  assert.equal(user.googleCalendar.calendarId, '')
  assert.equal(user.googleCalendar.calendarName, '')
  assert.equal(user.googleCalendar.refreshToken, '')
  assert.equal(user.googleCalendar.accessToken, '')
  assert.equal(user.googleCalendar.syncToken, '')
  assert.equal(user.googleCalendar.email, '')
})
