const toDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const hasDepositByTransactions = (eventId, transactions) => {
  if (!eventId) return false
  return (Array.isArray(transactions) ? transactions : []).some((item) => {
    if (String(item?.eventId) !== String(eventId)) return false
    if (item?.type !== 'income') return false
    if (!['deposit', 'advance'].includes(String(item?.category ?? ''))) return false
    return Number(item?.amount ?? 0) > 0
  })
}

const hasNoDeposit = (event, transactions, now = new Date()) => {
  if (!event) return false
  if (!event?.waitDeposit) return false
  const dueAt = toDate(event?.depositDueAt)
  if (!dueAt) return false
  if (dueAt.getTime() > now.getTime()) return false
  return !hasDepositByTransactions(event?._id, transactions)
}

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const endOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)

// A dated overdue task already belongs to the overdue section. Do not create
// a second warning for it; completed and undated tasks do not define a next step.
export const getRequestsWithoutNextStep = (events) =>
  (Array.isArray(events) ? events : [])
    .filter(
      (event) =>
        event?.status === 'draft' &&
        !(
          Array.isArray(event.additionalEvents) ? event.additionalEvents : []
        ).some((item) => item && !item.done && toDate(item.date))
    )
    .sort(
      (a, b) =>
        (toDate(a.requestCreatedAt || a.createdAt)?.getTime() ?? 0) -
        (toDate(b.requestCreatedAt || b.createdAt)?.getTime() ?? 0)
    )

const ADDITIONAL_EVENTS_DISPLAY_GROUPS = Object.freeze([
  { key: 'overdue', label: 'Просрочено' },
  { key: 'today', label: 'Сегодня' },
  { key: 'tomorrow', label: 'Завтра' },
  { key: 'later', label: 'Позднее' },
  { key: 'withoutDate', label: 'Без даты' },
  { key: 'completed', label: 'Выполненные' },
])

const getAdditionalEventDisplayGroupKey = (item, now = new Date()) => {
  if (item?.done) return 'completed'
  const dateValue = item?.date
  const date = toDate(dateValue)
  if (!date) return 'withoutDate'

  const nowMs = now.getTime()
  const todayStart = startOfDay(now).getTime()
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000
  const dayAfterTomorrowStart = tomorrowStart + 24 * 60 * 60 * 1000
  const dateMs = date.getTime()

  if (dateMs < nowMs) return 'overdue'
  if (dateMs >= todayStart && dateMs < tomorrowStart) return 'today'
  if (dateMs >= tomorrowStart && dateMs < dayAfterTomorrowStart)
    return 'tomorrow'
  return 'later'
}

export const getAdditionalEventSegment = (dateValue, now = new Date()) => {
  const date = toDate(dateValue)
  if (!date) return null
  const nowMs = now.getTime()
  const todayStart = startOfDay(now).getTime()
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000
  const dayAfterTomorrowStart = tomorrowStart + 24 * 60 * 60 * 1000
  const dateMs = date.getTime()

  if (dateMs < nowMs) return 'overdue'
  if (dateMs >= todayStart && dateMs < tomorrowStart) return 'today'
  if (dateMs >= tomorrowStart && dateMs < dayAfterTomorrowStart)
    return 'tomorrow'
  return null
}

export const getAdditionalEventsSummary = (events, now = new Date()) => {
  const summary = {
    overdue: 0,
    today: 0,
    tomorrow: 0,
  }

  ;(Array.isArray(events) ? events : []).forEach((event) => {
    ;(Array.isArray(event?.additionalEvents) ? event.additionalEvents : []).forEach(
      (item) => {
        if (item?.done) return
        const segment = getAdditionalEventSegment(item?.date, now)
        if (segment) summary[segment] += 1
      }
    )
  })

  return summary
}

export const getInAppReminderSummary = (events, now = new Date()) => {
  const summary = {
    overdue: 0,
    today: 0,
    tomorrow: 0,
    soon2h: 0,
    total: 0,
  }
  const nowMs = now.getTime()
  const soonMs = nowMs + 2 * 60 * 60 * 1000

  ;(Array.isArray(events) ? events : []).forEach((event) => {
    if (event?.status === 'canceled' || event?.status === 'closed') return
    ;(Array.isArray(event?.additionalEvents) ? event.additionalEvents : []).forEach(
      (item) => {
        if (item?.done) return
        const date = toDate(item?.date)
        if (!date) return
        const dateMs = date.getTime()
        const segment = getAdditionalEventSegment(date, now)
        if (segment && segment in summary) summary[segment] += 1
        if (dateMs >= nowMs && dateMs <= soonMs) summary.soon2h += 1
      }
    )
  })

  summary.total = summary.overdue + summary.today + summary.soon2h
  return summary
}

export const eventHasAdditionalSegment = (event, segment, now = new Date()) => {
  if (!segment) return true
  const additionalEvents = Array.isArray(event?.additionalEvents)
    ? event.additionalEvents
    : []
  return additionalEvents.some(
    (item) => !item?.done && getAdditionalEventSegment(item?.date, now) === segment
  )
}

export const getUpcomingEventsByDays = (events, days = 3, now = new Date()) => {
  const start = startOfDay(now).getTime()
  const endDate = new Date(now)
  endDate.setDate(endDate.getDate() + Math.max(1, days) - 1)
  const end = endOfDay(endDate).getTime()

  return (Array.isArray(events) ? events : [])
    .filter((event) => {
      if (event?.status === 'canceled') return false
      const date = toDate(event?.eventDate)
      if (!date) return false
      const ms = date.getTime()
      return ms >= start && ms <= end
    })
    .sort((a, b) => {
      const dateA = toDate(a?.eventDate)?.getTime() ?? 0
      const dateB = toDate(b?.eventDate)?.getTime() ?? 0
      return dateA - dateB
    })
}

export const getAdditionalEventsListBySegments = (events, now = new Date()) => {
  const segments = {
    overdue: [],
    today: [],
    tomorrow: [],
  }

  ;(Array.isArray(events) ? events : []).forEach((event) => {
    ;(Array.isArray(event?.additionalEvents) ? event.additionalEvents : []).forEach(
      (item, index) => {
        if (item?.done) return
        const segment = getAdditionalEventSegment(item?.date, now)
        if (!segment) return
        segments[segment].push({
          eventId: event?._id,
          eventDate: event?.eventDate ?? null,
          eventType: event?.eventType ?? '',
          eventStatus: event?.status ?? '',
          eventAddress: event?.address ?? null,
          eventTown: event?.address?.town ?? '',
          eventDescription: event?.description ?? '',
          title: item?.title ?? '',
          description: item?.description ?? '',
          date: item?.date ?? null,
          index,
        })
      }
    )
  })

  Object.keys(segments).forEach((key) => {
    segments[key].sort((a, b) => {
      const dateA = toDate(a?.date)?.getTime() ?? 0
      const dateB = toDate(b?.date)?.getTime() ?? 0
      return dateA - dateB
    })
  })

  return segments
}

export const getAdditionalEventsDisplayGroups = (
  additionalEvents,
  now = new Date()
) => {
  const grouped = ADDITIONAL_EVENTS_DISPLAY_GROUPS.reduce((acc, group) => {
    acc[group.key] = []
    return acc
  }, {})

  ;(Array.isArray(additionalEvents) ? additionalEvents : []).forEach(
    (item, originalIndex) => {
      const key = getAdditionalEventDisplayGroupKey(item, now)
      const isDone = Boolean(item?.done)
      const displayDate = isDone
        ? item?.doneAt ?? item?.date ?? null
        : item?.date ?? null
      grouped[key].push({
        ...item,
        displayDate,
        displayDateLabel: isDone ? 'Выполнено' : '',
        originalIndex,
      })
    }
  )

  return ADDITIONAL_EVENTS_DISPLAY_GROUPS.map((group) => ({
    ...group,
    items: grouped[group.key].sort((a, b) => {
      const dateA =
        toDate(a?.displayDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
      const dateB =
        toDate(b?.displayDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
      return dateA - dateB
    }),
  })).filter((group) => group.items.length > 0)
}

export const isAdditionalEventOverdue = (item, now = new Date()) => {
  if (!item || item?.done) return false
  const date = toDate(item?.date)
  if (!date) return false
  return date.getTime() < now.getTime()
}

export const getEventOverdueAdditionalCount = (event, now = new Date()) => {
  const additionalEvents = Array.isArray(event?.additionalEvents)
    ? event.additionalEvents
    : []
  return additionalEvents.filter((item) => isAdditionalEventOverdue(item, now))
    .length
}

export const getSoonNoDepositEvents = (
  events,
  transactions = [],
  now = new Date(),
  days = 3
) => {
  void days

  return (Array.isArray(events) ? events : [])
    .filter((event) => {
      if (!event) return false
      if (['draft', 'canceled', 'closed'].includes(String(event.status))) return false
      return hasNoDeposit(event, transactions, now)
    })
    .sort((a, b) => {
      const dueA = toDate(a?.depositDueAt)?.getTime() ?? 0
      const dueB = toDate(b?.depositDueAt)?.getTime() ?? 0
      return dueA - dueB
    })
}
