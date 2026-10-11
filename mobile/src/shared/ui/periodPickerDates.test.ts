import { localDay, parsePeriodDay, periodError, periodMonthCells, periodPresets, readManualDay, compactPeriodSummary } from './periodPickerDates'
it('строгие календарные даты, без rollover', () => {
  for (const value of ['2026-02-31', '2023-02-29', '2026-00-01', '2026-13-01', '2026-01-00', '0000-01-01', '2026-1-1', '2026-10-01T00:00:00Z']) expect(parsePeriodDay(value)).toBeNull()
  expect(localDay(parsePeriodDay('2024-02-29')!)).toBe('2024-02-29')
  expect(readManualDay(' 29.02.2024 ')).toBe('2024-02-29'); expect(readManualDay('29.02.2023')).toBeNull()
  expect(periodError({ from: '', to: '2026-01-01' })).toBe('')
})
it('пресеты на границах месяца/года по локальному дню', () => {
  const presets = periodPresets(new Date(2026, 0, 1, 0, 5))
  expect(presets[2].range()).toEqual({ from: '2025-12-26', to: '2026-01-01' })
  expect(presets[4].range()).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  expect(periodPresets(new Date(2024, 1, 10))[3].range()).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  expect(periodMonthCells(new Date(2024, 1, 1)).filter(Boolean)).toHaveLength(29)
})
it('поддерживает те же четыре цифры года, что веб, без переезда 0099 в 1999', () => {
  for (const key of ['0001-01-01', '0099-01-01', '1000-01-01', '9999-12-31']) expect(localDay(parsePeriodDay(key)!)).toBe(key)
})
it.each([
  [{ from: '2026-10-01', to: '2026-10-09' }, '1–9 окт. 2026'],
  [{ from: '2026-09-29', to: '2026-10-02' }, '29 сент. – 2 окт. 2026'],
  [{ from: '2025-12-31', to: '2026-01-02' }, '31.12.2025 – 02.01.2026'],
  [{ from: '2024-02-29', to: '2024-02-29' }, '29 февр. 2024'],
  [{ from: '2026-10-09', to: '' }, 'С 9 окт. 2026'],
  [{ from: '', to: '2026-10-09' }, 'По 9 окт. 2026'],
  [{ from: '', to: '' }, 'За всё время'],
])('краткая подпись двух границ: %s', (range, caption) => expect(compactPeriodSummary(range)).toBe(caption))
