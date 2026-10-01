import { eventActionReasons, eventDuration, getEventDetailFinance } from './eventDetail'
import type { Event, Transaction } from '../../shared/domain/types'
const event: Event = { _id: 'local-event', status: 'active', contractSum: 1000 }
const transaction = (category: string, amount: number, overrides: Partial<Transaction> = {}): Transaction => ({
  _id: category, category, amount, eventId: event._id, type: 'income', paymentMethod: 'cash', ...overrides,
})
it('KPI и остаток как в PWA учитывают все фактические доходы текущей работы', () => {
  const transactions = [transaction('deposit', 100), transaction('final_payment', 200), transaction('advance', 50),
    transaction('client_payment', 100), transaction('tips', 30), transaction('referral_in', 20),
    transaction('travel', 10, { type: 'expense' }), transaction('referral_out', 5, { type: 'expense' }),
    transaction('final_payment', 550, { paymentMethod: 'obligation' }),
    transaction('expense', 60, { paymentMethod: 'obligation', type: 'expense' }),
    transaction('final_payment', 800, { eventId: 'other-event' })]
  expect(getEventDetailFinance(event, transactions)).toMatchObject({ paid: 500, expense: 15, net: 485,
    clientPaid: 500, remaining: 500, hasObligations: true, depositPaid: 150 })
  transactions[8].paymentMethod = 'transfer'
  expect(getEventDetailFinance(event, transactions)).toMatchObject({ clientPaid: 1050, remaining: 0, overpaid: 50, paid: 1050 })
})
it.each(['draft', 'active', 'closed', 'canceled'] as const)('оплата доступна только для active: %s', (status) => {
  expect(Boolean(eventActionReasons({ ...event, status }, false).payment)).toBe(status !== 'active')
})
it('объясняет ограничения локального ID и offline; история существующей записи доступна из cache', () => {
  expect(eventActionReasons(event, true).history).toContain('синхронизации')
  expect(eventActionReasons(event, true).conversations).toContain('синхронизации')
  expect(eventActionReasons({ ...event, _id: 'server-event' }, false)).toMatchObject({ history: '', conversations: 'Для переписок нужен интернет.' })
})
it('длительность учитывает несколько суток и смещения, не показывает некорректный интервал', () => {
  expect(eventDuration({ ...event, eventDate: '2026-10-01T11:00:00+07:00', dateEnd: '2026-10-02T12:30:00+07:00' })).toBe('25 ч 30 мин')
  expect(eventDuration(event)).toBe('')
  expect(eventDuration({ ...event, eventDate: 'bad', dateEnd: '2026-10-02' })).toBe('')
})
