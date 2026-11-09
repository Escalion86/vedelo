import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { loadBindings } from 'next/dist/build/swc/index.js'
import { chain, loader } from './stageFLoader.cjs'
import {
  googleCalendarConnectionKey,
  googleCalendarResourceKey,
  insertOrReadGoogleCalendarResource,
} from '../../server/googleCalendarStableInsert.mjs'

const calendarId = 'fixture-calendar'
const key = googleCalendarResourceKey('tenant-a', calendarId, 'work-id')
const duplicate = () => Object.assign(Error('duplicate'), { response: { status: 409 } })

test('resource IDs are stable, Google-compatible, and scoped to work, task, calendar and tenant', () => {
  assert.match(key, /^[0-9a-v]{5,1024}$/)
  assert.equal(googleCalendarResourceKey('tenant-a', calendarId, 'work-id'), key)
  assert.equal(new Set([
    key,
    googleCalendarResourceKey('tenant-b', calendarId, 'work-id'),
    googleCalendarResourceKey('tenant-a', 'other-calendar', 'work-id'),
    googleCalendarResourceKey('tenant-a', calendarId, 'other-work'),
    googleCalendarResourceKey('tenant-a', calendarId, 'work-id', 'task-id'),
  ]).size, 5)
  const user = { _id: 'user' }, connection = { refreshToken: 'fixture' }
  assert.notEqual(googleCalendarConnectionKey(user, connection, calendarId), googleCalendarConnectionKey(user, connection, 'new-calendar'))
  assert.notEqual(googleCalendarConnectionKey(user, connection, calendarId), googleCalendarConnectionKey(user, { refreshToken: 'rotated' }, calendarId))
})

test('lost insert response and parallel callers reconcile one existing provider resource', async () => {
  const resources = new Map()
  let loseResponse = true
  const events = {
    async insert({ resource }) {
      if (resources.has(resource.id)) throw duplicate()
      resources.set(resource.id, resource)
      if (loseResponse) { loseResponse = false; throw Error('lost response') }
      return { data: resource }
    },
    async get({ eventId }) { return { data: resources.get(eventId) } },
    async update({ eventId, resource }) {
      const data = { ...resource, id: eventId }
      resources.set(eventId, data)
      return { data }
    },
  }
  const send = () => insertOrReadGoogleCalendarResource(events, calendarId, { summary: 'Work' }, key)
  await assert.rejects(send(), /lost response/)
  const responses = await Promise.all([send(), send()])
  assert.deepEqual(responses.map(response => response.data.id), [key, key])
  assert.equal(resources.size, 1)
  assert.equal(resources.get(key).extendedProperties.private.vedeloKey, key)
})

test('a collision without ownership is rejected and an owned replay rechecks authorization', async () => {
  let writes = 0
  let existing = { id: key, extendedProperties: { private: { vedeloKey: 'foreign' } } }
  const events = {
    async insert() { throw duplicate() },
    async get() { return { data: existing } },
    async update() { writes += 1 },
  }
  await assert.rejects(insertOrReadGoogleCalendarResource(events, calendarId, {}, key), /duplicate/)
  existing = { id: key, extendedProperties: { private: { vedeloKey: key } } }
  let checked = 0
  await assert.rejects(insertOrReadGoogleCalendarResource(events, calendarId, {}, key, async () => {
    if (++checked === 2) throw Error('connection changed')
  }), /connection changed/)
  assert.equal(writes, 0)
})

test('calendar sync reads Mongoose task IDs and persists only their Google links', async () => {
  await loadBindings()
  const Work = mongoose.model('CalendarLinkFixture', new mongoose.Schema({
    tenantId: mongoose.Schema.Types.ObjectId,
    eventDate: Date,
    additionalEvents: [{ title: String, date: Date, googleSyncMode: String }],
  }))
  const tenantId = new mongoose.Types.ObjectId()
  const when = new Date('2030-10-01T12:00:00Z')
  const work = new Work({ tenantId, eventDate: when, additionalEvents: [
    { title: 'Call back', date: when, googleSyncMode: 'event' },
    { title: 'Do not export', date: when, googleSyncMode: 'none' },
  ] })
  const inserted = [], writes = []
  const db = async () => {}
  const load = loader({
    '@server/dbConnect': db,
    'server\\dbConnect.js': db,
    'server/dbConnect.js': db,
    '@server/googleAdditionalSync': {},
    '@server/googleEventDescription': {
      buildGoogleEventDescription: async () => ({ preparedText: '', clientContactLines: [], colleagueContactLines: [] }),
      sanitizeToPlainText: value => value,
      isValidDateValue: date => date instanceof Date && Number.isFinite(date.getTime()),
    },
    '@server/googleUserCalendarClient': {
      getUserCalendarClient: () => ({ events: { insert: async ({ resource }) => {
        inserted.push(resource)
        return { data: resource }
      } } }),
      getUserCalendarId: () => calendarId,
      normalizeCalendarSettings: () => ({ enabled: true, refreshToken: 'fixture' }),
    },
    '@models/Events': { updateOne: async (filter, update) => { writes.push({ filter, update }); return { matchedCount: 1 } } },
    '@models/SiteSettings': { findOne: () => chain(null) },
    '@models/Histories': {},
    '@models/Services': {},
    '@models/Clients': {},
    '@models/Transactions': {},
  })
  await load('server/CRUD.js').updateEventInCalendar(work, null, { _id: tenantId })
  const task = work.additionalEvents[0]
  const taskKey = googleCalendarResourceKey(tenantId, calendarId, work._id, task._id)
  assert.deepEqual(inserted.map(item => item.id), [
    googleCalendarResourceKey(tenantId, calendarId, work._id), taskKey,
  ])
  const taskWrite = writes.find(({ filter }) => filter.additionalEvents)
  assert.equal(taskWrite.filter.tenantId, tenantId)
  assert.equal(taskWrite.filter.additionalEvents.$elemMatch._id, task._id)
  assert.deepEqual(taskWrite.update, { $set: { 'additionalEvents.$.googleCalendarEventId': taskKey } })
})
