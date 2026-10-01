import type { Client, Event, Service, Transaction } from '../../shared/domain/types'
import { eventFilterStatus } from './filters'

export type EventCardTone = 'neutral' | 'success' | 'warning' | 'danger' | 'blue'

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
})

const validDate = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const sameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

export const formatEventCardMoney = (value: number) =>
  `${moneyFormatter.format(Number(value || 0))} ₽`

export const formatEventCardDate = (value?: string | null) => {
  const date = validDate(value)
  if (!date) return 'Дата не назначена'
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const getEventCardTitle = (event: Event, services: Service[]) => {
  const eventTitle = event.eventType?.trim() || 'Событие не указано'
  const serviceTitles = services
    .map((service) => service.title?.trim())
    .filter(Boolean)
  return `${eventTitle} • ${serviceTitles.join(', ') || 'Услуга не указана'}`
}

export const getEventCardClientName = (client?: Client) =>
  client
    ? [client.firstName, client.secondName].filter(Boolean).join(' ') || 'Клиент'
    : 'Клиент не указан'

export const getEventCardAddress = (event: Event) =>
  [event.address?.town, event.address?.street, event.address?.house]
    .filter(Boolean)
    .join(', ')

export const getEventCardStatus = (event: Event, now = new Date()) => {
  const eventEnd = validDate(event.dateEnd ?? event.eventDate)
  if (event.status === 'canceled') {
    return { label: 'Отменено', tone: 'danger' as EventCardTone, marker: 'danger' as const }
  }
  if (event.status === 'closed') {
    return { label: 'Закрыто', tone: 'success' as EventCardTone, marker: 'success' as const }
  }
  if (event.status === 'draft') {
    return { label: 'Заявка', tone: 'warning' as EventCardTone, marker: 'warning' as const }
  }
  if (eventEnd && eventEnd.getTime() < now.getTime()) {
    return { label: 'Завершено', tone: 'neutral' as EventCardTone, marker: 'neutral' as const }
  }
  return { label: 'Подтверждено', tone: 'blue' as EventCardTone, marker: 'blue' as const }
}

export const getEventCardFinance = (
  event: Event,
  transactions: Transaction[]
) => {
  const actual = transactions.filter((transaction) => (!transaction.eventId || transaction.eventId === event._id) && Number.isFinite(Number(transaction.amount)))
  const paid = actual
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
  const expense = actual
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
  const depositPaid = actual
    .filter(
      (transaction) =>
        transaction.type === 'income' &&
        ['deposit', 'advance'].includes(transaction.category || '')
    )
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)
  const contractSum = Number(event.contractSum || 0)
  const expectedDeposit = Number(event.depositExpectedAmount || 0)
  return {
    hasObligations: transactions.some((transaction) => transaction.paymentMethod === 'obligation'),
    paid,
    expense,
    net: paid - expense,
    contractSum,
    depositPaid,
    depositPending: Boolean(
      event.waitDeposit &&
        (expectedDeposit <= 0 || depositPaid < expectedDeposit)
    ),
  }
}

const formatTaskDate = (date: Date, now: Date) => {
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const time = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
  if (sameDay(date, now)) return `Сегодня ${time}`
  if (sameDay(date, tomorrow)) return `Завтра ${time}`
  return `${date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  })} ${time}`
}

export const getEventCardAttention = (
  event: Event,
  transactions: Transaction[],
  now = new Date()
) => {
  const finance = getEventCardFinance(event, transactions)
  const depositDueAt = validDate(event.depositDueAt)
  const hasOverdueDeposit = Boolean(
    event.status === 'active' &&
      event.waitDeposit &&
      depositDueAt &&
      depositDueAt.getTime() <= now.getTime() &&
      finance.depositPaid <= 0
  )
  if (hasOverdueDeposit && depositDueAt) {
    const amount = Number(event.depositExpectedAmount || 0)
    const details = [
      amount > 0 ? formatEventCardMoney(amount) : '',
      depositDueAt ? `до ${depositDueAt.toLocaleDateString('ru-RU')}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    return {
      label: `Просрочен задаток${details ? `: ${details}` : ''}`,
      tone: 'danger' as EventCardTone,
      hiddenCount: (event.additionalEvents || []).filter((item) => !item.done).length,
      overdueCount: (event.additionalEvents || []).filter((item) => {
        const date = validDate(item.date)
        return !item.done && date && date.getTime() < now.getTime()
      }).length,
    }
  }

  const tasks = (event.additionalEvents || [])
    .map((task) => {
      const date = validDate(task.date)
      return !task.done && date ? { task, date } : null
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => left.date.getTime() - right.date.getTime())
  if (!tasks.length) return null
  const overdue = tasks.filter((item) => item.date.getTime() < now.getTime())
  const nearest = overdue.at(-1) || tasks[0]
  return {
    label: `${nearest.task.title || 'Следующий контакт'}: ${formatTaskDate(nearest.date, now)}`,
    tone: (overdue.length
      ? 'danger'
      : sameDay(nearest.date, now)
        ? 'warning'
        : 'blue') as EventCardTone,
    hiddenCount: Math.max(0, tasks.length - 1),
    overdueCount: overdue.length,
  }
}

// Only closed has a financial result. Canceled keeps the paid/contract projection.
export const getEventCardFinanceLabel = (event: Event) => event.status === 'closed' ? 'Итог' : 'Оплачено / договор'
export const getEventCardStatusKey = (event: Event, now = new Date()) => {
  const status = eventFilterStatus(event, now)
  return status === 'request' ? 'draft' : status
}
export const getEventCardDateParts = (value?: string | null) => {
  const date = validDate(value)
  if (!date) return null
  return {
    weekday: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
    day: String(date.getDate()),
    month: date.toLocaleDateString('ru-RU', { month: 'short' }),
    time: date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  }
}
