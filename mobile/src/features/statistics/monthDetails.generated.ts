// @ts-nocheck
// Generated from helpers/getStatisticsMonthDetails.js by generate-pwa-domain.cjs.
const isValidDate = (value) => {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

const getMonthKeyFromValue = (value) => {
  if (!isValidDate(value)) return ''
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const getDateTime = (value) =>
  isValidDate(value) ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER

const sortByDateValueAsc = (items, getDateValue) =>
  [...items].sort(
    (a, b) => getDateTime(getDateValue(a)) - getDateTime(getDateValue(b))
  )

const createEmptyEventStatusCounts = () => ({
  draft: 0,
  confirmed: 0,
  finished: 0,
  canceled: 0,
})

const getEventStatusCountKey = (event, now) => {
  if (event?.status === 'draft') return 'draft'
  if (event?.status === 'canceled') return 'canceled'

  const dateRaw = event?.dateEnd ?? event?.eventDate
  if (isValidDate(dateRaw) && new Date(dateRaw).getTime() < now) {
    return 'finished'
  }

  return 'confirmed'
}

const getEventStatusCounts = (events, now) =>
  events.reduce((counts, event) => {
    counts[getEventStatusCountKey(event, now)] += 1
    return counts
  }, createEmptyEventStatusCounts())

const getEventPaymentLeft = (event, eventFinanceMap) => {
  const finance = eventFinanceMap.get(event?._id) || { income: 0, expense: 0 }
  const paid = Math.max(Number(finance.income ?? 0), 0)
  return Math.max(Number(event?.contractSum ?? 0) - paid, 0)
}

export const getStatisticsMonthDetails = ({
  monthKey,
  filteredEvents = [],
  filteredTransactions = [],
  eventFinanceMap = new Map(),
  now = Date.now(),
}) => {
  const events = sortByDateValueAsc(
    filteredEvents.filter(
      (event) => getMonthKeyFromValue(event?.eventDate) === monthKey
    ),
    (event) => event?.eventDate
  )
  const eventIds = new Set(events.map((event) => event?._id).filter(Boolean))
  const transactions = sortByDateValueAsc(
    filteredTransactions.filter((transaction) => {
      if (transaction?.eventId) return eventIds.has(transaction.eventId)
      return getMonthKeyFromValue(transaction?.date) === monthKey
    }),
    (transaction) => transaction?.date
  )

  const totalIncome = transactions
    .filter((transaction) => transaction?.type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0)
  const totalExpense = transactions
    .filter((transaction) => transaction?.type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0)

  const paymentLeft = events.reduce(
    (sum, event) => sum + getEventPaymentLeft(event, eventFinanceMap),
    0
  )
  const hasUnderpaidEvents = events.some(
    (event) => getEventPaymentLeft(event, eventFinanceMap) > 0
  )

  const depositPaid = events.reduce((sum, event) => {
    const finance = eventFinanceMap.get(event?._id) || { income: 0, expense: 0 }
    return sum + Math.max(Number(finance.income ?? 0), 0)
  }, 0)

  const transferredEvents = events.filter((event) => event?.isTransferred)
  const eventStatusCounts = getEventStatusCounts(
    events.filter((event) => !event?.isTransferred),
    now
  )
  const transferredEventStatusCounts = getEventStatusCounts(
    transferredEvents,
    now
  )

  return {
    events,
    transactions,
    summary: {
      totalIncome,
      totalExpense,
      profit: totalIncome - totalExpense,
      paymentLeft,
      depositPaid,
      hasUnderpaidEvents,
      eventStatusCounts,
      transferredEventStatusCounts,
    },
  }
}
