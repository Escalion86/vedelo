/** Calendar dates only. Consumers retain ownership of instant/timezone serialization. */
export type PeriodRange = { from: string; to: string }
export type PeriodPreset = { label: string; range: () => PeriodRange }
const pad = (value: number) => String(value).padStart(2, '0')
export const localDay = (date: Date) => `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export function periodCalendarDate(year: number, month: number, day: number): Date {
  const date = new Date(0)
  date.setFullYear(year, month, day)
  date.setHours(12, 0, 0, 0)
  return date
}
export function parsePeriodDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return null
  const date = periodCalendarDate(year, month - 1, day)
  return localDay(date) === value ? date : null
}
export const manualDay = (value: string) => value ? value.split('-').reverse().join('.') : ''
export function readManualDay(value: string): string | null {
  const text = value.trim()
  if (!text) return ''
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(text)) return null
  const day = text.split('.').reverse().join('-')
  return parsePeriodDay(day) ? day : null
}
export function periodError(range: PeriodRange) {
  if ((range.from && !parsePeriodDay(range.from)) || (range.to && !parsePeriodDay(range.to))) return 'Введите существующую дату в формате ДД.ММ.ГГГГ'
  return range.from && range.to && range.from > range.to ? 'Конец периода не может быть раньше начала' : ''
}
export const fullDay = (value: string) => parsePeriodDay(value)?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) || value
export const periodSummary = ({ from, to }: PeriodRange) => !from && !to ? 'За всё время'
  : from && to ? from === to ? fullDay(from) : `${fullDay(from)} — ${fullDay(to)}`
    : from ? `С ${fullDay(from)}` : `По ${fullDay(to)} включительно`
export function compactPeriodSummary({ from, to }: PeriodRange): string {
  if (!from && !to) return 'За всё время'
  const months = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.']
  const short = (key: string, year = true) => {
    if (!parsePeriodDay(key)) return key
    const [y, m, d] = key.split('-')
    return `${Number(d)} ${months[Number(m) - 1]}${year ? ` ${y}` : ''}`
  }
  if (!from) return `По ${short(to)}`
  if (!to) return `С ${short(from)}`
  if (from === to) return short(from)
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${manualDay(from)} – ${manualDay(to)}`
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${short(to)}`
  return `${short(from, false)} – ${short(to)}`
}
export function periodPresets(now = new Date()): PeriodPreset[] {
  const today = periodCalendarDate(now.getFullYear(), now.getMonth(), now.getDate())
  const shift = (days: number) => periodCalendarDate(today.getFullYear(), today.getMonth(), today.getDate() + days)
  const between = (from: Date, to: Date) => ({ from: localDay(from), to: localDay(to) })
  return [
    { label: 'За всё время', range: () => ({ from: '', to: '' }) },
    { label: 'Сегодня', range: () => between(today, today) },
    { label: 'Последние 7 дней', range: () => between(shift(-6), today) },
    { label: 'Текущий месяц', range: () => between(periodCalendarDate(today.getFullYear(), today.getMonth(), 1), periodCalendarDate(today.getFullYear(), today.getMonth() + 1, 0)) },
    { label: 'Прошлый месяц', range: () => between(periodCalendarDate(today.getFullYear(), today.getMonth() - 1, 1), periodCalendarDate(today.getFullYear(), today.getMonth(), 0)) },
  ]
}
export function periodMonthCells(cursor: Date): (number | null)[] {
  const prefix = (periodCalendarDate(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7
  const count = periodCalendarDate(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(prefix).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  return cells
}
