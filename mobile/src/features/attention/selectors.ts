import type { Client, Event, Transaction } from '../../shared/domain/types'

export type Segment = 'overdue' | 'today' | 'tomorrow'
export type Task = NonNullable<Event['additionalEvents']>[number]
export type AttentionItem = {
  key: string
  event: Event
  index: number
  task: Task
  kind: 'task' | 'deposit'
}
export const segments: Segment[] = ['overdue', 'today', 'tomorrow']
export const segmentLabels = { overdue: 'Просрочено', today: 'Сегодня', tomorrow: 'Завтра' }

export const parseDate = (value?: string | null) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
const dayStart = (now: Date, offset = 0) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
const sameDay = (value: string | null | undefined, now: Date) => {
  const date = parseDate(value)
  return date && dayStart(date).getTime() === dayStart(now).getTime()
}

// Как в PWA: срок раньше текущего момента, а не только вчера, уже просрочен.
export const getTaskSegment = (value: string | null | undefined, now: Date): Segment | null => {
  const date = parseDate(value)
  if (!date) return null
  if (date < now) return 'overdue'
  if (date < dayStart(now, 1)) return 'today'
  if (date < dayStart(now, 2)) return 'tomorrow'
  return null
}
const isOpen = (event: Event) => !['closed', 'canceled'].includes(event.status)
export const isPastUnclosed = (event: Event, now: Date) => {
  const end = parseDate(event.dateEnd ?? event.eventDate)
  return event.status === 'active' && !event.isTransferred && Boolean(end && end < now)
}

export function selectAttention(events: Event[], transactions: Transaction[], clients: Client[], now: Date) {
  const groups: Record<Segment, AttentionItem[]> = { overdue: [], today: [], tomorrow: [] }
  const open = events.filter(isOpen)
  for (const event of open) {
    ;(event.additionalEvents || []).forEach((task, index) => {
      let segment = getTaskSegment(task.date, now)
      if (task.done) {
        const doneToday = sameDay(task.doneAt, now)
        if (!segment) {
          if (!doneToday) return
          segment = 'today'
        }
        if (segment === 'overdue' && !doneToday) return
      }
      if (!segment) return
      groups[segment].push({ key: `${event._id}:task:${task._id || index}`, event, task, index, kind: 'task' })
    })
  }
  // PWA считает задаток полученным при любом положительном deposit/advance.
  const paid = new Set(transactions.filter((item) => item.type === 'income' &&
    ['deposit', 'advance'].includes(item.category || '') && item.amount > 0).map((item) => item.eventId))
  const deposits = open.filter((event) => event.status === 'active' && event.waitDeposit && !paid.has(event._id))
    .sort((a, b) => (parseDate(a.depositDueAt)?.getTime() ?? Infinity) - (parseDate(b.depositDueAt)?.getTime() ?? Infinity))
  for (const event of deposits) {
    const due = parseDate(event.depositDueAt)
    if (!due || due > now) continue
    groups.overdue.push({ key: `${event._id}:deposit`, event, index: -1, kind: 'deposit', task: {
      title: 'Просрочен задаток', date: event.depositDueAt,
      description: Number(event.depositExpectedAmount) > 0
        ? `Ожидается: ${Number(event.depositExpectedAmount).toLocaleString('ru-RU')} ₽` : '',
    } })
  }
  for (const segment of segments) {
    groups[segment].sort((a, b) => Number(Boolean(a.task.done)) - Number(Boolean(b.task.done)) ||
      (parseDate(a.task.date)?.getTime() ?? 0) - (parseDate(b.task.date)?.getTime() ?? 0))
  }
  const pending = Object.fromEntries(segments.map((segment) =>
    [segment, groups[segment].filter((item) => !item.task.done).length])) as Record<Segment, number>
  const upcoming = open.filter((event) => {
    const start = parseDate(event.eventDate)
    const end = parseDate(event.dateEnd ?? event.eventDate)
    // В native продолжающаяся многодневная работа тоже видна в ближайших.
    return start && end && start < dayStart(now, 3) && end >= dayStart(now)
  }).sort((a, b) => parseDate(a.eventDate)!.getTime() - parseDate(b.eventDate)!.getTime())
  const clientDates = clients.flatMap((client) => (client.significantDates || []).flatMap((item, index) => {
    const source = parseDate(item.date)
    if (!source) return []
    let nextDate = new Date(now.getFullYear(), source.getMonth(), source.getDate())
    if (nextDate < dayStart(now)) nextDate = new Date(now.getFullYear() + 1, source.getMonth(), source.getDate())
    return [{ key: `${client._id}:${item._id || index}`, client, title: item.title?.trim() || 'Значимая дата',
      comment: item.comment?.trim() || '', nextDate,
      daysLeft: Math.round((nextDate.getTime() - dayStart(now).getTime()) / 86_400_000) }]
  })).sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
  return { groups, pending, deposits, upcoming, clientDates, pastUnclosed: events.filter((event) => isPastUnclosed(event, now)) }
}
