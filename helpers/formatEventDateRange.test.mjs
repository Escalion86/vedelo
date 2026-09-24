import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatEventDateRange } from './formatEventDateRange.mjs'

const localDate = (year, month, day, hour, minute = 0) =>
  new Date(year, month - 1, day, hour, minute)

test('compact range hides the current year and shows another year', () => {
  assert.equal(
    formatEventDateRange(localDate(2026, 10, 17, 18), localDate(2026, 10, 17, 19), 2026),
    '17 окт. СБ 18:00 - 19:00'
  )
  assert.equal(
    formatEventDateRange(localDate(2025, 10, 17, 18), localDate(2025, 10, 17, 19), 2026),
    '17 окт. 2025 ПТ 18:00 - 19:00'
  )
})

test('different days and years keep both dates unambiguous', () => {
  assert.equal(
    formatEventDateRange(localDate(2026, 12, 31, 23), localDate(2027, 1, 1, 1), 2026),
    '31 дек. ЧТ 23:00 - 1 янв. 2027 ПТ 01:00'
  )
})

test('missing dates keep the existing draft fallback', () => {
  assert.equal(formatEventDateRange(null, null, 2026), 'Пока неизвестны')
  assert.equal(
    formatEventDateRange(localDate(2026, 10, 17, 18), null, 2026),
    '17 окт. СБ 18:00'
  )
  assert.equal(
    formatEventDateRange(localDate(2025, 10, 17, 18), null, 2026),
    '17 окт. 2025 ПТ 18:00'
  )
})
