import type { Transaction } from '../../shared/domain/types'
import { formatTransactionDateInput, parseTransactionDateInput } from '../../shared/domain/finance'
export type DateRange = { from: string; to: string }
export type TransactionFilters = { type: 'all' | 'income' | 'expense' | 'obligation'; linked: boolean; unlinked: boolean; range: DateRange }
export const initialTransactionFilters = (): TransactionFilters => ({ type: 'all', linked: true, unlinked: true, range: { from: '', to: '' } })
export const toggleRelation = (filters: TransactionFilters, key: 'linked' | 'unlinked'): TransactionFilters => {
  const next = { ...filters, [key]: !filters[key] }
  return next.linked || next.unlinked ? next : filters
}
const boundary = (value: string, end = false) => {
  const parsed = parseTransactionDateInput(value)
  if (!parsed) return null
  const date = new Date(parsed); date.setHours(end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0)
  return date.getTime()
}
export const selectTransactions = (rows: Transaction[], filters: TransactionFilters) => {
  const from = boundary(filters.range.from), to = boundary(filters.range.to, true)
  return rows.filter((row) => {
    const obligation = row.paymentMethod === 'obligation'
    if (filters.type !== 'all' && (filters.type === 'obligation' ? !obligation : obligation || row.type !== filters.type)) return false
    const linked = Boolean(row.clientId || row.eventId)
    if (linked ? !filters.linked : !filters.unlinked) return false
    if (from !== null || to !== null) {
      const date = row.date ? Date.parse(row.date) : NaN
      if (!Number.isFinite(date) || (from !== null && date < from) || (to !== null && date > to)) return false
    }
    return true
  }).sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0))
}
export const rangeByDay = (range: DateRange, day: string): DateRange => !range.from || range.to ? { from: day, to: '' }
  : day < range.from ? { from: day, to: range.from } : { from: range.from, to: day }
export const monthCells = (cursor: Date): Array<number | null> => {
  const prefix = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7
  const length = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells: Array<number | null> = [...Array(prefix).fill(null), ...Array.from({ length }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  return cells
}
export const nextWeekend = (now = new Date()): DateRange => {
  const saturday = new Date(now); saturday.setDate(now.getDate() + (6 - now.getDay() + 7) % 7)
  const sunday = new Date(saturday); sunday.setDate(saturday.getDate() + 1)
  return { from: formatTransactionDateInput(saturday.toISOString()), to: formatTransactionDateInput(sunday.toISOString()) }
}
const rangeDayLabel = (value: string) => {
  const date = parseTransactionDateInput(value)
  return date ? new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).replace(' ', '\u00a0') : value
}
export const rangeLabel = (range: DateRange) => !range.from ? 'Период' : range.to && range.to !== range.from ? `${rangeDayLabel(range.from)} — ${rangeDayLabel(range.to)}` : rangeDayLabel(range.from)
