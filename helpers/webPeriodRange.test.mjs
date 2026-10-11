import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDateKey,
  parseManualDate,
  dateKey,
  shiftDay,
  periodPresets,
  rangeError,
  rangeSummary,
  compactRangeSummary,
} from './webPeriodRange.mjs'

test('Строгие существующие календарные даты и завершённый ручной ввод', () => {
  for (const key of ['2024-02-29', '2000-02-29', '2026-10-09', '0099-01-01'])
    assert.ok(parseDateKey(key), key)
  for (const key of [
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-00-10',
    '2026-13-01',
    '2026-10-00',
    '2026-1-01',
    '2026-10',
    '0000-01-01',
  ])
    assert.equal(parseDateKey(key), null, key)
  assert.equal(parseManualDate('29.02.2024'), '2024-02-29')
  for (const text of [
    '29.02.2026',
    '31.04.2026',
    '01.13.2026',
    '1.01.2026',
    '01.01.20',
  ])
    assert.equal(parseManualDate(text), null)
  assert.equal(parseManualDate(''), '')
})
test('Локальная дата отличается от UTC около полуночи; сдвиг дня не меняет границы из-за DST', () => {
  const d = new Date('2026-10-08T18:00:00Z')
  assert.equal(dateKey(d, 'UTC'), '2026-10-08')
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  assert.equal(dateKey(d), expected)
  assert.equal(shiftDay('2024-02-28', 1), '2024-02-29')
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01')
})
test('Пресеты включают сегодня, прошлый месяц и ограниченный сегодняшний месяц', () => {
  const presets = periodPresets({ today: '2026-10-09' })
  assert.deepEqual(presets.find((p) => p.id === 'week').range, {
    from: '2026-10-03',
    to: '2026-10-09',
  })
  assert.deepEqual(presets.find((p) => p.id === 'month').range, {
    from: '2026-10-01',
    to: '2026-10-31',
  })
  assert.deepEqual(presets.find((p) => p.id === 'previous').range, {
    from: '2026-09-01',
    to: '2026-09-30',
  })
  assert.deepEqual(
    periodPresets({
      today: '2026-10-09',
      maxDate: '2026-10-09',
      requiredRange: true,
    }).find((p) => p.id === 'month').range,
    { from: '2026-10-01', to: '2026-10-09' }
  )
  assert.equal(
    periodPresets({ today: '2026-10-09', requiredRange: true }).some(
      (p) => p.id === 'all'
    ),
    false
  )
})
test('Открытые границы только при разрешении, один день и порядок', () => {
  assert.equal(rangeError({ from: '', to: '' }), '')
  assert.equal(rangeError({ from: '', to: '2026-10-09' }), '')
  assert.ok(rangeError({ from: '', to: '2026-10-09' }, { requiredRange: true }))
  assert.ok(rangeError({ from: '2026-10-10', to: '2026-10-09' }))
  assert.equal(
    rangeError(
      { from: '2026-10-09', to: '2026-10-09' },
      { requiredRange: true, maxDays: 1 }
    ),
    ''
  )
})
test('MaxDays включительно: 366 разрешено, 367 нет; max/minDate и invalid', () => {
  const options = { requiredRange: true, maxDays: 366, maxDate: '2026-10-09' }
  assert.equal(
    rangeError({ from: '2025-10-09', to: '2026-10-09' }, options),
    ''
  )
  assert.ok(rangeError({ from: '2025-10-08', to: '2026-10-09' }, options))
  assert.ok(rangeError({ from: '2026-10-09', to: '2026-10-10' }, options))
  assert.ok(
    rangeError(
      { from: '2026-10-08', to: '2026-10-09' },
      { minDate: '2026-10-09' }
    )
  )
  assert.ok(rangeError({ from: '2026-02-29', to: '' }))
})
test('Полный диапазон и открытый конец доступны в подписи', () => {
  assert.match(rangeSummary({ from: '2026-10-01', to: '2026-10-09' }), /2026/)
  assert.match(rangeSummary({ from: '', to: '2026-10-09' }), /^По /)
  assert.equal(rangeSummary({ from: '', to: '' }), 'За всё время')
})
test('Краткая подпись сохраняет две границы, месяц и годы', () => {
  for (const [range, caption] of [
    [{ from: '2026-10-01', to: '2026-10-09' }, '1–9 окт. 2026'],
    [{ from: '2026-09-29', to: '2026-10-02' }, '29 сент. – 2 окт. 2026'],
    [{ from: '2025-12-31', to: '2026-01-02' }, '31.12.2025 – 02.01.2026'],
    [{ from: '2024-02-29', to: '2024-02-29' }, '29 февр. 2024'],
    [{ from: '2026-10-09', to: '' }, 'С 9 окт. 2026'],
    [{ from: '', to: '2026-10-09' }, 'По 9 окт. 2026'],
    [{ from: '', to: '' }, 'За всё время'],
  ]) assert.equal(compactRangeSummary(range), caption)
})
