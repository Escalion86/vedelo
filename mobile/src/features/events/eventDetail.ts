import type { Event, Transaction } from '../../shared/domain/types'
import { getEventCardFinance } from './eventCard'
import { parseEventDateInput } from '../../shared/domain/eventForm'

export const getEventDetailFinance = (event: Event, transactions: Transaction[]) => {
  const related = transactions.filter((item) => item.eventId === event._id && Number.isFinite(item.amount) && item.amount >= 0)
  const summary = getEventCardFinance(event, related)
  const clientPaid = related.filter((item) => item.type === 'income' && item.paymentMethod !== 'obligation' &&
    ['deposit', 'advance', 'final_payment', 'client_payment'].includes(item.category || ''))
    .reduce((sum, item) => sum + item.amount, 0)
  return { ...summary, clientPaid, remaining: Math.max(0, summary.contractSum - clientPaid),
    overpaid: Math.max(0, clientPaid - summary.contractSum) }
}
const dateValue = (value?: string | null) => {
  if (!value) return null
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? parseEventDateInput(value) || NaN : value)
  return Number.isFinite(date.getTime()) ? date : null
}
export const detailDate = (value?: string | null) => dateValue(value)?.toLocaleString('ru-RU') || 'Не указано'
export const eventDuration = (event: Event) => {
  const start = dateValue(event.eventDate), end = dateValue(event.dateEnd)
  if (!start || !end || end < start) return ''
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000)
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`
}
export const eventActionReasons = (event: Event, online: boolean) => ({
  payment: event.status === 'active' ? '' : 'Оплату или расход можно добавить только в статусе «Подтверждено».',
  history: event._id.startsWith('local-') ? 'История появится после первой синхронизации.' : '',
  conversations: event._id.startsWith('local-') ? 'Переписки доступны после первой синхронизации.'
    : !online ? 'Для переписок нужен интернет.' : '',
})
