import type { StatisticsPayload } from './statistics'
type ChartEvent = StatisticsPayload['events'][number]
type ChartTransaction = StatisticsPayload['transactions'][number]
type Finance = { income: number; expense: number }
type Counts = { finished: number; planned: number; draft: number; canceled: number }
export type MonthStat = { monthKey: string; month: string; income: number; expense: number; profit: number; isFuture: boolean; isOpenMonth: boolean; isUnfinished: boolean; plannedIncome: number; paymentLeft: number; eventCount: number; eventCounts: Counts; transferredEventCounts: Counts }
const MONTHS_FULL_1 = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь']
// Формула helpers/buildStatisticsChartData.js. Браузерный тест сравнивает оба результата.


const isValidDate = (value: string | null | undefined) => {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

const buildMonthLabel = (date: Date) => MONTHS_FULL_1[date.getMonth()]

const getMonthKey = (date: Date, year: number) =>
  `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`

const getMonthIndexFromKey = (monthKey: string) => Number(monthKey.slice(5, 7)) - 1

const createEmptyEventCounts = () => ({
  finished: 0,
  planned: 0,
  draft: 0,
  canceled: 0,
})

const getNonCanceledEventCountsTotal = (eventCounts: Counts) =>
  Number(eventCounts?.finished ?? 0) +
  Number(eventCounts?.planned ?? 0) +
  Number(eventCounts?.draft ?? 0)

const getEventCountKey = (event: ChartEvent, currentDate: Date): keyof Counts => {
  if (event?.status === 'draft') return 'draft'
  if (event?.status === 'canceled') return 'canceled'

  const dateRaw = event?.dateEnd ?? event?.eventDate
  if (isValidDate(dateRaw) && new Date(dateRaw!).getTime() < currentDate.getTime()) {
    return 'finished'
  }

  return 'planned'
}

const ensureMonthBucket = ({
  byMonth,
  date,
  selectedYear,
  isFutureMonth,
  isOpenCurrentMonth,
  isUnfinishedMonth,
}: { byMonth: Map<string, MonthStat>; date: Date; selectedYear: number; isFutureMonth: (month: number) => boolean; isOpenCurrentMonth: (month: number) => boolean; isUnfinishedMonth: (month: number) => boolean }) => {
  const key = getMonthKey(date, selectedYear)
  if (!byMonth.has(key)) {
    byMonth.set(key, {
      monthKey: key,
      month: buildMonthLabel(date),
      income: 0,
      expense: 0,
      profit: 0,
      isFuture: isFutureMonth(date.getMonth()),
      isOpenMonth: isOpenCurrentMonth(date.getMonth()),
      isUnfinished: isUnfinishedMonth(date.getMonth()),
      plannedIncome: 0,
      paymentLeft: 0,
      eventCount: 0,
      eventCounts: createEmptyEventCounts(),
      transferredEventCounts: createEmptyEventCounts(),
    })
  }
  return byMonth.get(key)!
}

export const buildStatisticsChartData = ({
  selectedYear,
  filteredEvents = [],
  filteredTransactions = [],
  countEvents,
  eventsMap = new Map(),
  eventFinanceMap = new Map(),
  currentDate = new Date(),
}: { selectedYear: number | null; filteredEvents?: ChartEvent[]; filteredTransactions?: ChartTransaction[]; countEvents?: ChartEvent[]; eventsMap?: Map<string, ChartEvent>; eventFinanceMap?: Map<string, Finance>; currentDate?: Date }): MonthStat[] => {
  if (!selectedYear) return []

  const byMonth = new Map<string, MonthStat>()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth()
  const isFutureMonth = (monthIndex: number) =>
    selectedYear > currentYear ||
    (selectedYear === currentYear && monthIndex > currentMonth)
  const isOpenCurrentMonth = (monthIndex: number) =>
    selectedYear === currentYear && monthIndex === currentMonth
  const isUnfinishedMonth = (monthIndex: number) =>
    isFutureMonth(monthIndex) || isOpenCurrentMonth(monthIndex)

  const chartCountEvents = Array.isArray(countEvents) ? countEvents : filteredEvents

  chartCountEvents.forEach((event) => {
    if (!event?.eventDate || !isValidDate(event.eventDate)) return
    const date = new Date(event.eventDate)
    if (date.getFullYear() !== selectedYear) return
    const bucket = ensureMonthBucket({
      byMonth,
      date,
      selectedYear,
      isFutureMonth,
      isOpenCurrentMonth,
      isUnfinishedMonth,
    })
    const countKey = getEventCountKey(event, currentDate)
    const eventCountsTarget = event?.isTransferred
      ? bucket.transferredEventCounts
      : bucket.eventCounts
    eventCountsTarget[countKey] += 1
    if (countKey !== 'canceled' && !event?.isTransferred) {
      bucket.eventCount += 1
    }
  })

  filteredEvents.forEach((event) => {
    if (!event?.eventDate || !isValidDate(event.eventDate)) return
    const date = new Date(event.eventDate)
    const bucket = ensureMonthBucket({
      byMonth,
      date,
      selectedYear,
      isFutureMonth,
      isOpenCurrentMonth,
      isUnfinishedMonth,
    })
    const finance = eventFinanceMap.get(event?._id) || {
      income: 0,
      expense: 0,
    }
    const paid = Math.max(Number(finance.income ?? 0), 0)
    const contractSum = Number(event?.contractSum ?? 0)

    if (bucket.isFuture) {
      bucket.plannedIncome += finance.income - finance.expense
    }

    bucket.paymentLeft += Math.max(contractSum - paid, 0)
  })

  filteredTransactions.forEach((transaction) => {
    const event = transaction?.eventId ? eventsMap.get(transaction.eventId) : null
    const dateSource = event?.eventDate ?? transaction?.date
    if (!isValidDate(dateSource)) return
    const date = new Date(dateSource!)
    if (date.getFullYear() !== selectedYear) return
    const bucket = ensureMonthBucket({
      byMonth,
      date,
      selectedYear,
      isFutureMonth,
      isOpenCurrentMonth,
      isUnfinishedMonth,
    })
    if (bucket.isFuture) return
    const amount = Number(transaction.amount ?? 0)
    if (transaction.type === 'income') bucket.income += amount
    if (transaction.type === 'expense') bucket.expense += amount
    bucket.profit = bucket.income - bucket.expense
  })

  const eventMonthIndexes = Array.from(byMonth.values())
    .filter(
      (value) =>
        Number(value.eventCount ?? 0) +
          getNonCanceledEventCountsTotal(value.transferredEventCounts) >
        0
    )
    .map((value) => getMonthIndexFromKey(value.monthKey))
    .filter((monthIndex: number) => monthIndex >= 0 && monthIndex <= 11)

  const hasEventMonthRange = eventMonthIndexes.length > 0
  const minEventMonthIndex = hasEventMonthRange
    ? Math.min(...eventMonthIndexes)
    : 0
  const maxEventMonthIndex = hasEventMonthRange
    ? Math.max(...eventMonthIndexes)
    : 11

  if (hasEventMonthRange) {
    for (let monthIndex = minEventMonthIndex; monthIndex <= maxEventMonthIndex; monthIndex += 1) {
      ensureMonthBucket({
        byMonth,
        date: new Date(selectedYear, monthIndex, 1),
        selectedYear,
        isFutureMonth,
        isOpenCurrentMonth,
        isUnfinishedMonth,
      })
    }
  }

  return Array.from(byMonth.entries())
    .filter(([key]) => {
      if (!hasEventMonthRange) return true
      const monthIndex = getMonthIndexFromKey(key)
      return monthIndex >= minEventMonthIndex && monthIndex <= maxEventMonthIndex
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => {
      if (value.isFuture) {
        return {
          ...value,
          profit: Number(value.plannedIncome ?? 0),
        }
      }
      return value
    })
}
