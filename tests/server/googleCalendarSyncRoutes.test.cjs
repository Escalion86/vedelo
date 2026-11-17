const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const mongoose = require('mongoose')
const { NextResponse } = require('next/server')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const load = (filename, dependencies) => {
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: { parser: { syntax: 'ecmascript' } },
    module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => {
    assert.ok(id in dependencies, `Missing test dependency ${id}`)
    return dependencies[id]
  }, mod, mod.exports)
  return mod.exports
}

test('calendar status and retry restrict access to the current tenant and return only public status', async () => {
  await loadBindings()
  const status = load('server/calendarSyncStatus.js', {})
  const ownId = 'a'.repeat(24)
  const foreignId = 'b'.repeat(24)
  const own = { _id: ownId, tenantId: 'own', syncVersion: 3, calendarSyncJob: { leaseToken: 'hidden' } }
  const foreign = { _id: foreignId, tenantId: 'foreign' }
  const events = [own, foreign]
  const query = (data) => ({ select: () => query(data), lean: async () => data })
  let context = { tenantId: own.tenantId, user: { _id: 'user' } }
  let calendarAccess = true
  let calendarLinked = true
  const scheduled = []
  const now = new Date('2026-11-17T05:00:00Z')
  const queue = {
    getGoogleCalendarSyncAccount: async () => context.user,
    getGoogleCalendarSyncUpdate: () => ({
      $set: { calendarSyncStatus: 'pending', calendarSyncUpdatedAt: now, calendarSyncJob: { connectionKey: 'connection' } },
    }),
    scheduleGoogleCalendarSync: (...args) => scheduled.push(args),
  }
  const matches = (event, filter) => event.tenantId === filter.tenantId && event._id === filter._id
  const deps = {
    'next/server': { NextResponse },
    mongoose,
    '@models/Events': {
      find: (filter, projection) => {
        assert.deepEqual(projection, status.calendarSyncStatusProjection)
        return query(events.filter((row) => row.tenantId === filter.tenantId && filter._id.$in.includes(row._id)))
      },
      findOne: (filter) => query(events.find((row) => matches(row, filter))),
      findOneAndUpdate: (filter, update) => {
        const item = events.find((row) => matches(row, filter))
        assert.equal(filter.syncVersion, item.syncVersion)
        assert.equal(filter.calendarSyncUpdatedAt, item.calendarSyncUpdatedAt ?? null)
        return query(Object.assign(item, update.$set))
      },
    },
    '@server/dbConnect': async () => {},
    '@server/getRequestContext': async () => context,
    '@server/getUserTariffAccess': async () => ({ allowCalendarSync: calendarAccess }),
    '@server/googleCalendarStableInsert.mjs': { googleCalendarConnectionKey: () => 'connection' },
    '@server/googleUserCalendarClient': {
      getUserCalendarId: () => 'calendar',
      normalizeCalendarSettings: () => ({ enabled: calendarLinked, refreshToken: calendarLinked ? 'token' : '' }),
    },
    '@server/googleCalendarSyncQueue': queue,
    '@server/calendarSyncStatus': status,
  }
  deps['@server/googleCalendarSyncRequest'] = load('server/googleCalendarSyncRequest.js', deps)
  const { GET } = load('app/api/events/calendar-sync/route.js', deps)
  const { POST } = load('app/api/events/[id]/calendar-sync/route.js', deps)
  const endpoint = 'https://vedelo.test/api/events/calendar-sync'
  const retry = (id) => POST(new Request(endpoint, { method: 'POST' }), { params: Promise.resolve({ id }) })

  const response = await GET(new Request(`${endpoint}?ids=${ownId},${foreignId}&tenantId=foreign`))
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual(await response.json(), {
    success: true,
    data: [{ _id: ownId, calendarSyncStatus: '', calendarSyncError: '', calendarSyncUpdatedAt: null, syncVersion: 3 }],
  })
  assert.equal((await GET(new Request(`${endpoint}?ids=bogus`))).status, 400)
  assert.equal((await retry(foreignId)).status, 404)
  assert.equal(scheduled.length, 0)
  const queued = await (await retry(ownId)).json()
  assert.deepEqual(queued, {
    success: true,
    data: { _id: ownId, calendarSyncStatus: 'pending', calendarSyncError: '', calendarSyncUpdatedAt: now.toISOString(), syncVersion: 3 },
  })
  assert.equal(scheduled[0][0], own.tenantId)
  assert.equal(scheduled[0][1], ownId)
  assert.equal((await retry(ownId)).status, 200)
  assert.equal(own.calendarSyncUpdatedAt, now)
  calendarAccess = false
  assert.equal((await retry(ownId)).status, 403)
  calendarAccess = true
  calendarLinked = false
  assert.equal((await retry(ownId)).status, 409)
  context = {}
  assert.equal((await retry(ownId)).status, 401)
  assert.equal((await GET(new Request(`${endpoint}?ids=${ownId}`))).status, 401)
})
