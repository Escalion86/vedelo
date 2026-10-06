import { filterHistoryItems } from './filter'
import type { HistoryItem } from './types'

const rows: HistoryItem[] = [
  {
    id: '1', entityType: 'client', entityId: 'client-1', operation: 'update',
    entityLabel: 'Анна Иванова', summary: 'Изменён клиент', changes: [],
    source: 'android', actorId: 'actor-1', actorLabel: 'Анна', occurredAt: '2026-08-23T10:00:00.000Z',
  },
  {
    id: '2', entityType: 'event', entityId: 'event-1', operation: 'create',
    entityLabel: 'Заявка: Свадьба', summary: 'Добавлена заявка', changes: [],
    source: 'web', actorId: 'actor-2', actorLabel: 'Иван', occurredAt: '2026-08-23T11:00:00.000Z',
  },
]

test('offline history filters by entity, source and search', () => {
  expect(filterHistoryItems(rows, { entityType: 'client', source: 'android', search: 'анна' }))
    .toEqual([rows[0]])
})

test('offline history is sorted newest first', () => {
  expect(filterHistoryItems(rows, {}).map((item) => item.id)).toEqual(['2', '1'])
})

test('offline history filters by actor', () => {
  expect(filterHistoryItems(rows, { actorId: 'actor-2' })).toEqual([rows[1]])
})

import { dateRangeError, fixedHistoryRoute, mergeHistoryItems, normalizeHistoryDates, validCalendarDate } from './filter'
test.each(['2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', '2026-01-01garbage'])('нет JS rollover для %s', (value) => { expect(validCalendarDate(value)).toBe(false); expect(dateRangeError(value, '')).not.toBe(''); expect(() => normalizeHistoryDates({ dateFrom: value })).toThrow() })
test('високосная дата и обратный диапазон', () => { expect(validCalendarDate('2024-02-29')).toBe(true); expect(dateRangeError('2026-10-03', '2026-10-01')).not.toBe('') })
test('границы дат совпадают с текущей PWA семантикой в UTC и Asia/Krasnoyarsk', () => {
  const from = new Date('2026-08-23').getTime(); const to = new Date('2026-08-23T23:59:59.999').getTime()
  const dated = [from - 1, from, to, to + 1].map((time, index) => ({ ...rows[0], id: String(index), occurredAt: new Date(time).toISOString() }))
  expect(filterHistoryItems(dated, { dateFrom: '2026-08-23', dateTo: '2026-08-23' }).map((row) => row.id)).toEqual(['2', '1'])
  expect(normalizeHistoryDates({ dateFrom: '2026-08-23', dateTo: '2026-08-23' })).toEqual({ dateFrom: '2026-08-23T00:00:00.000Z', dateTo: new Date(to).toISOString() })
  if (process.env.TZ === 'Asia/Krasnoyarsk') expect(new Date(to).toISOString()).toBe('2026-08-23T16:59:59.999Z')
  if (process.env.TZ === 'UTC') expect(new Date(to).toISOString()).toBe('2026-08-23T23:59:59.999Z')
})
test('ISO диапазон и поиск/операция работают совместно, исходный массив не меняется', () => {
  expect(filterHistoryItems(rows, { dateFrom: '2026-08-23T10:00:00.000Z', dateTo: '2026-08-23T10:00:00.000Z', operation: 'update', search: 'АННА' })).toEqual([rows[0]])
  expect(rows.map((row) => row.id)).toEqual(['1', '2'])
})
test.each([{ entityId: 'a'.repeat(24) }, { entityType: 'event' }, { entityType: 'unknown', entityId: 'a'.repeat(24) }, { entityType: 'event', entityId: ' '+ 'a'.repeat(24) }, { entityType: ['event'], entityId: 'a'.repeat(24) }, { entityType: 'client', entityId: 'https://bad.example' }])('invalid fixed route не превращается в общий запрос', (params) => expect(fixedHistoryRoute(params)).toBeNull())
test('валидный fixed route сохраняет исходный токен', () => { const id = 'A'.repeat(24); expect(fixedHistoryRoute({ entityType: 'event', entityId: id })).toEqual({ entityType: 'event', entityId: id }); expect(fixedHistoryRoute({})).toEqual({}) })
test('dedup между страницами и внутри страницы', () => { expect(mergeHistoryItems([rows[0]], [rows[1], rows[0], { ...rows[1], summary: 'updated' }])).toEqual([{ ...rows[1], summary: 'updated' }, rows[0]]) })

test.each(['2026-02-31T00:00:00Z', '2026-10-01T24:00:00Z', '2026-10-01T12:60:00Z', '2026-10-01T12:00:60Z'])('ISO rollover отвергается (%s)', (dateFrom) => expect(() => normalizeHistoryDates({ dateFrom })).toThrow())
