// Calendar keys are civil days. UTC is used only for day arithmetic, never to
// convert a locally selected YYYY-MM-DD into another day.
const pad = (n) => String(n).padStart(2, '0')
export const EMPTY_PERIOD = Object.freeze({ from: '', to: '' })
export function parseDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return null
  const d = new Date(0)
  d.setUTCFullYear(year, month - 1, day)
  d.setUTCHours(12, 0, 0, 0)
  return d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
    ? d
    : null
}
export function dateKey(date = new Date(), timeZone = 'local') {
  if (timeZone === 'UTC')
    return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
export function shiftDay(key, days) {
  const d = parseDateKey(key)
  if (!d) return ''
  d.setUTCDate(d.getUTCDate() + days)
  return dateKey(d, 'UTC')
}
export const manualDate = (key) =>
  key ? key.split('-').reverse().join('.') : ''
export function parseManualDate(text) {
  if (!text.trim()) return ''
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim())
  if (!match) return null
  const key = `${match[3]}-${match[2]}-${match[1]}`
  return parseDateKey(key) ? key : null
}
export function rangeError(
  range = {},
  { requiredRange = false, minDate, maxDate, maxDays } = {}
) {
  const { from = '', to = '' } = range
  if (
    (from && !parseDateKey(from)) ||
    (to && !parseDateKey(to)) ||
    from === null ||
    to === null
  )
    return 'Введите существующую дату в формате ДД.ММ.ГГГГ'
  if (requiredRange && (!from || !to)) return 'Укажите начало и конец периода'
  if (from && to && from > to)
    return 'Конец периода не может быть раньше начала'
  if (minDate && [from, to].some((v) => v && v < minDate))
    return `Дата должна быть не раньше ${manualDate(minDate)}`
  if (maxDate && [from, to].some((v) => v && v > maxDate))
    return `Дата должна быть не позднее ${manualDate(maxDate)}`
  if (
    maxDays &&
    from &&
    to &&
    (+parseDateKey(to) - +parseDateKey(from)) / 86400000 + 1 > maxDays
  )
    return `Выберите не более ${maxDays} дней`
  return ''
}
export function rangeSummary({ from = '', to = '' } = {}) {
  if (!from && !to) return 'За всё время'
  const pretty = (key) =>
    parseDateKey(key)?.toLocaleDateString('ru-RU', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }) || key
  if (!from) return `По ${pretty(to)}`
  if (!to) return `С ${pretty(from)}`
  return from === to ? pretty(from) : `${pretty(from)} — ${pretty(to)}`
}
export function compactRangeSummary({ from = '', to = '' } = {}) {
  if (!from && !to) return 'За всё время'
  const months = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.']
  const short = (key, year = true) => {
    if (!parseDateKey(key)) return key
    const [y, m, d] = key.split('-')
    return `${Number(d)} ${months[Number(m) - 1]}${year ? ` ${y}` : ''}`
  }
  if (!from) return `По ${short(to)}`
  if (!to) return `С ${short(from)}`
  if (from === to) return short(from)
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${manualDate(from)} – ${manualDate(to)}`
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${short(to)}`
  return `${short(from, false)} – ${short(to)}`
}
export function periodPresets({
  today = dateKey(),
  requiredRange = false,
  maxDate,
  extraPresets = [],
} = {}) {
  const first = today.slice(0, 7) + '-01'
  const next = parseDateKey(first)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const previous = shiftDay(first, -1)
  const monthEnd = shiftDay(dateKey(next, 'UTC'), -1)
  return [
    ...(!requiredRange
      ? [{ id: 'all', label: 'За всё время', range: { ...EMPTY_PERIOD } }]
      : []),
    { id: 'today', label: 'Сегодня', range: { from: today, to: today } },
    {
      id: 'week',
      label: 'Последние 7 дней',
      range: { from: shiftDay(today, -6), to: today },
    },
    {
      id: 'month',
      label: 'Текущий месяц',
      range: {
        from: first,
        to: maxDate && maxDate < monthEnd ? maxDate : monthEnd,
      },
    },
    {
      id: 'previous',
      label: 'Прошлый месяц',
      range: { from: previous.slice(0, 7) + '-01', to: previous },
    },
    ...extraPresets,
  ]
}
