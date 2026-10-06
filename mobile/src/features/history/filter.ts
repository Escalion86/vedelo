import type { HistoryFilters, HistoryItem } from './types'

export function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}
const timestamp = (value: string, end: boolean) => {
  if (validCalendarDate(value)) {
    // Match the current PWA/API: date-only start is UTC; the end is local
    // 23:59:59.999. Send ISO instants so server timezone cannot reinterpret it.
    return new Date(end ? `${value}T23:59:59.999` : value).getTime()
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !validCalendarDate(value.slice(0, 10))) return NaN
  const [hour, minute, second] = value.slice(11, 19).split(':').map(Number)
  if (hour > 23 || minute > 59 || second > 59) return NaN
  return Date.parse(value)
}
export const validHistoryInstant = (value: string) => value.includes('T') && Number.isFinite(timestamp(value, false))
export function normalizeHistoryDates(filters: HistoryFilters): HistoryFilters {
  const from = filters.dateFrom ? timestamp(filters.dateFrom, false) : null
  const to = filters.dateTo ? timestamp(filters.dateTo, true) : null
  if ((from !== null && !Number.isFinite(from)) || (to !== null && !Number.isFinite(to)) || (from !== null && to !== null && from > to)) throw new Error('INVALID_DATE_RANGE')
  return { ...filters, dateFrom: from === null ? '' : new Date(from).toISOString(), dateTo: to === null ? '' : new Date(to).toISOString() }
}
export function dateRangeError(dateFrom: string, dateTo: string) {
  if ((dateFrom && !validCalendarDate(dateFrom)) || (dateTo && !validCalendarDate(dateTo))) return 'Введите существующую дату в формате ГГГГ-ММ-ДД'
  if (dateFrom && dateTo && dateFrom > dateTo) return 'Дата начала должна быть не позже даты окончания'
  try { normalizeHistoryDates({ dateFrom, dateTo }); return '' } catch { return 'Проверьте диапазон дат' }
}
export function filterHistoryItems<T extends HistoryItem>(items: T[], filters: HistoryFilters) {
  const dates = normalizeHistoryDates(filters)
  const from = dates.dateFrom ? Date.parse(dates.dateFrom) : -Infinity
  const to = dates.dateTo ? Date.parse(dates.dateTo) : Infinity
  const search = filters.search?.trim().toLowerCase()
  return items.filter((item) => {
    const time = Date.parse(item.occurredAt)
    return Number.isFinite(time) && time >= from && time <= to &&
      (!filters.entityType || item.entityType === filters.entityType) && (!filters.entityId || item.entityId === filters.entityId) &&
      (!filters.operation || item.operation === filters.operation) && (!filters.source || item.source === filters.source) && (!filters.actorId || item.actorId === filters.actorId) &&
      (!search || `${item.summary} ${item.entityLabel} ${item.actorLabel || ''}`.toLowerCase().includes(search))
  }).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id.localeCompare(a.id))
}
export const validEntityId = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
export function fixedHistoryRoute(params: { entityType?: unknown; entityId?: unknown }): HistoryFilters | null {
  if (params.entityType === undefined && params.entityId === undefined) return {}
  if (!['event', 'client', 'transaction'].includes(params.entityType as string) || !validEntityId(params.entityId)) return null
  return { entityType: params.entityType as string, entityId: params.entityId }
}
export function mergeHistoryItems(current: HistoryItem[], incoming: HistoryItem[]) {
  const map = new Map(current.map((item) => [item.id, item]))
  incoming.forEach((item) => map.set(item.id, item))
  return filterHistoryItems(Array.from(map.values()), {})
}
