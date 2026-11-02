import type { StatisticsPayload } from './statistics'

type Selection = { year: number | null; town: string; includeRequests: boolean }
const yearOf = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).getFullYear() : null

export function statisticsYears(data: StatisticsPayload) {
  const years = new Set<number>()
  for (const event of data.events) {
    const year = yearOf(event.eventDate)
    if (year !== null) years.add(year)
  }
  for (const transaction of data.transactions) {
    if (transaction.eventId) continue
    const year = yearOf(transaction.date)
    if (year !== null) years.add(year)
  }
  return [...years].sort((a, b) => b - a)
}

// Same selection as PWA useFilteredStatistics. Canceled work belongs only to
// chart counters, drafts are opt-in, and linked money follows its work's date.
export function selectStatistics(data: StatisticsPayload, selection: Selection) {
  const { year, town, includeRequests } = selection
  const chartCountEvents = data.events.filter(event => {
    const eventYear = yearOf(event.eventDate)
    return eventYear !== null && (!year || eventYear === year) &&
      (!town || event.address.town === town) &&
      (event.status !== 'draft' || includeRequests)
  })
  const events = chartCountEvents.filter(event => event.status !== 'canceled')
  const ids = new Set(events.map(event => event._id))
  const transactions = data.transactions.filter(transaction => transaction.eventId
    ? ids.has(transaction.eventId)
    : !town && (!year || yearOf(transaction.date) === year))
  return {
    data: { ...data, events, transactions, filters: { ...data.filters, year, town } },
    chartCountEvents,
  }
}
