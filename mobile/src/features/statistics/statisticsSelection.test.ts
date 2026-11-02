import { calculateStatistics, type StatisticsPayload } from './statistics'
import { selectStatistics, statisticsYears } from './statisticsSelection'

const event = (id: string, status: StatisticsPayload['events'][number]['status'], eventDate: string | null, town = 'Красноярск') => ({
  _id: id, clientId: null, eventType: '', description: id, eventDate, dateEnd: null,
  status, contractSum: 1000, address: { town, street: '', house: '' },
})
const transaction = (id: string, eventId: string | null, amount: number, date = '2020-02-01T12:00:00Z') => ({
  _id: id, eventId, amount, date, clientId: null, type: 'income' as const, category: '', comment: '',
})
const data: StatisticsPayload = {
  events: [event('active', 'active', '2026-10-01T12:00:00Z'), event('draft', 'draft', '2026-10-02T12:00:00Z'), event('canceled', 'canceled', '2026-10-03T12:00:00Z'), event('undated', 'active', null), event('old', 'closed', '2020-01-01T12:00:00Z')],
  transactions: [transaction('one', 'active', 100), transaction('two', 'draft', 200), transaction('three', 'canceled', 300), transaction('four', 'undated', 400), transaction('unlinked', null, 50, '2026-06-01T12:00:00Z'), transaction('older', null, 25)],
  clients: [], filters: { year: null, town: '', status: 'all' },
}
it('PWA defaults exclude requests, canceled and undated work from money but retain canceled chart counts', () => {
  const result = selectStatistics(data, { year: 2026, town: '', includeRequests: false })
  expect(result.data.events.map(e => e._id)).toEqual(['active'])
  // Linked payment follows the work year, not the payment year.
  expect(result.data.transactions.map(t => t._id)).toEqual(['one', 'unlinked'])
  const calculated = calculateStatistics(result.data, new Date('2026-10-31'), result.chartCountEvents)
  expect(calculated.income).toBe(150)
  expect(calculated.paymentLeft).toBe(900)
  expect(calculated.months.reduce((sum, month) => sum + month.eventCounts.canceled, 0)).toBe(1)
})
it('request switch adds to confirmed work; city excludes unlinked transactions; all years includes old work', () => {
  const selected = selectStatistics(data, { year: 2026, town: 'Красноярск', includeRequests: true })
  expect(selected.data.events.map(e => e._id)).toEqual(['active', 'draft'])
  expect(selected.data.transactions.map(t => t._id)).toEqual(['one', 'two'])
  expect(calculateStatistics(selected.data).income).toBe(300)
  expect(selectStatistics(data, { year: null, town: '', includeRequests: false }).data.events.map(e => e._id)).toEqual(['active', 'old'])
  expect(statisticsYears(data)).toEqual([2026, 2020])
})
