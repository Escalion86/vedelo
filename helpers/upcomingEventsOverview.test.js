import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getEventAddressLine,
  getEventTitle,
  getPendingAttentionCount,
  getPostponeActionsForSegment,
  moveDateToDayOffset,
  moveDateToSelectedDay,
} from './upcomingEventsOverview.js'

test('attention badge excludes completed tasks kept in the today list', () => {
  assert.equal(
    getPendingAttentionCount([
      { reminderType: 'additional' },
      { reminderType: 'depositOverdue' },
      { reminderType: 'additional_done' },
    ]),
    2
  )
})

test('getEventTitle returns event type as event name', () => {
  assert.equal(getEventTitle({ eventType: 'Свадьба' }), 'Свадьба')
  assert.equal(getEventTitle({ eventType: '  ' }), 'Мероприятие')
})

test('getEventAddressLine joins town street house and flat', () => {
  const line = getEventAddressLine({
    address: {
      town: 'Красноярск',
      street: 'Мира',
      house: '10',
      flat: '5',
    },
  })

  assert.equal(line, 'Красноярск, Мира, 10, кв. 5')
})

test('getPostponeActionsForSegment uses tomorrow and day after tomorrow for overdue and today', () => {
  assert.deepEqual(
    getPostponeActionsForSegment('overdue').map((item) => item.label),
    ['Перенести на завтра', 'Перенести на послезавтра']
  )
  assert.deepEqual(
    getPostponeActionsForSegment('today').map((item) => item.targetDayOffset),
    [1, 2]
  )
})

test('getPostponeActionsForSegment uses day after tomorrow and plus two days for tomorrow', () => {
  assert.deepEqual(
    getPostponeActionsForSegment('tomorrow').map((item) => item.label),
    ['Перенести на послезавтра', 'Перенести на +2 дня']
  )
  assert.deepEqual(
    getPostponeActionsForSegment('tomorrow').map(
      (item) => item.targetDayOffset
    ),
    [2, 3]
  )
})

test('moveDateToDayOffset moves to day relative to now and keeps original time', () => {
  const result = moveDateToDayOffset(
    new Date(2026, 5, 20, 18, 45),
    2,
    new Date(2026, 5, 22, 4, 0)
  )

  assert.equal(result.getFullYear(), 2026)
  assert.equal(result.getMonth(), 5)
  assert.equal(result.getDate(), 24)
  assert.equal(result.getHours(), 18)
  assert.equal(result.getMinutes(), 45)
})

test('выбор даты переноса сохраняет локальное время задачи и меняет день, месяц и год', () => {
  const source = new Date(2026, 10, 5, 18, 45, 12, 123)
  const selected = new Date(2027, 0, 2, 12)
  const result = moveDateToSelectedDay(source, selected)
  assert.equal(result.getFullYear(), 2027)
  assert.equal(result.getMonth(), 0)
  assert.equal(result.getDate(), 2)
  assert.equal(result.getHours(), 18)
  assert.equal(result.getMinutes(), 45)
  assert.equal(result.getSeconds(), 12)
  assert.equal(result.getMilliseconds(), 123)
  assert.equal(source.getDate(), 5)
  assert.equal(selected.getHours(), 12)
})

test('невалидный день не сохраняется; задача без даты использует текущее время', () => {
  const now = new Date(2026, 10, 5, 9, 30)
  assert.equal(moveDateToSelectedDay(now, 'invalid'), null)
  assert.equal(moveDateToSelectedDay(now, null), null)
  const result = moveDateToSelectedDay(null, new Date(2026, 10, 8), now)
  assert.equal(result.getDate(), 8)
  assert.equal(result.getHours(), 9)
  assert.equal(result.getMinutes(), 30)
})
