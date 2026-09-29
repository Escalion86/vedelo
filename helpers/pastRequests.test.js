import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPastRequests,
  isPastRequest,
  getPastRequestAge,
} from './pastRequests.js'
import { getEventStatusFlags } from './eventStatusFilter.js'
import {
  getStatusFilterDefaults,
  readEventListFiltersState,
} from './eventListFilters.js'

const now = new Date('2026-09-29T12:00:00Z')
const past = { status: 'draft', eventDate: '2026-09-27T12:00:00Z' }

test('прошедшая заявка остаётся заявкой и видна в стандартном фильтре', () => {
  const flags = getEventStatusFlags(past, now)
  assert.equal(flags.request, true)
  assert.equal(flags.canceled, false)
  assert.equal(flags.finished, false)
  assert.equal(getStatusFilterDefaults('past').request, true)
  assert.equal(getStatusFilterDefaults('past').canceled, false)
  const restored = readEventListFiltersState('past', {
    getItem: () =>
      JSON.stringify({
        version: 2,
        statusFilter: { finished: true, closed: true, canceled: false },
      }),
  })
  assert.equal(restored.statusFilter.request, true)
})

test('дата окончания имеет приоритет; нет даты или некорректная дата не считается прошедшей', () => {
  assert.equal(isPastRequest(past, now), true)
  for (const event of [
    { ...past, dateEnd: '2026-09-30T12:00:00Z' },
    { ...past, dateEnd: now },
    { ...past, dateEnd: 'bad-date' },
    { status: 'draft' },
    { ...past, status: 'canceled' },
    { ...past, status: 'closed' },
    { ...past, status: 'active' },
  ])
    assert.equal(isPastRequest(event, now), false)
  assert.equal(getPastRequestAge(past, now), '2 дня назад')
})

test('следующий контакт не скрывает заявку; закрытие, отмена и перенос убирают её', () => {
  const request = {
    ...past,
    _id: 'old',
    additionalEvents: [{ date: '2026-10-01', done: false }],
  }
  const recent = { ...past, _id: 'recent', eventDate: '2026-09-28T12:00:00Z' }
  assert.deepEqual(
    getPastRequests([recent, request], now).map((row) => row._id),
    ['old', 'recent']
  )
  for (const update of [
    { status: 'closed' },
    { status: 'canceled' },
    { eventDate: '2026-10-01' },
  ]) {
    assert.equal(getPastRequests([{ ...request, ...update }], now).length, 0)
  }
})
