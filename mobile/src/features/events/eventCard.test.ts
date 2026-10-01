import type { Event, Transaction } from '../../shared/domain/types'
import {
  getEventCardAttention,
  getEventCardFinance,
  getEventCardStatus,
  getEventCardTitle,
} from './eventCard'

const event = (values: Partial<Event> = {}): Event => ({
  _id: 'event-1',
  status: 'active',
  eventType: 'Свадьба',
  ...values,
})

const transaction = (values: Partial<Transaction> = {}): Transaction => ({
  _id: 'transaction-1',
  eventId: 'event-1',
  amount: 0,
  type: 'income',
  ...values,
})

describe('event card presentation', () => {
  it('собирает заголовок как в PWA из типа и услуг', () => {
    expect(
      getEventCardTitle(event(), [
        { _id: 'service-1', title: 'Ведение' },
        { _id: 'service-2', title: 'Аппаратура' },
      ])
    ).toBe('Свадьба • Ведение, Аппаратура')
  })

  it('показывает завершённое активное мероприятие нейтральным статусом', () => {
    expect(
      getEventCardStatus(
        event({ eventDate: '2026-07-20T10:00:00+07:00' }),
        new Date('2026-07-21T10:00:00+07:00')
      )
    ).toMatchObject({ label: 'Завершено', marker: 'neutral' })
  })

  it('повторяет сумму карточки PWA, включая обязательства', () => {
    const result = getEventCardFinance(event({ contractSum: 30_000 }), [
      transaction({ amount: 10_000, category: 'deposit' }),
      transaction({ amount: 5_000, paymentMethod: 'obligation' }),
      transaction({ amount: 2_000, type: 'expense' }),
    ])
    expect(result).toMatchObject({ paid: 15_000, expense: 2_000, net: 13_000 })
  })

  it('ставит просроченный задаток выше следующего контакта', () => {
    const result = getEventCardAttention(
      event({
        waitDeposit: true,
        depositExpectedAmount: 5_000,
        depositDueAt: '2026-07-20T10:00:00+07:00',
        additionalEvents: [
          { title: 'Позвонить', date: '2026-07-22T10:00:00+07:00' },
        ],
      }),
      [],
      new Date('2026-07-21T10:00:00+07:00')
    )
    expect(result).toMatchObject({ tone: 'danger', hiddenCount: 1 })
    expect(result?.label).toContain('Просрочен задаток')
  })
})

import { getEventCardFinanceLabel, getEventCardDateParts, getEventCardStatusKey } from './eventCard'

it.each(['draft', 'active', 'canceled', 'closed'] as const)('only closed shows result: %s', (status) => {
  expect(getEventCardFinanceLabel(event({ status }))).toBe(status === 'closed' ? 'Итог' : 'Оплачено / договор')
  expect(getEventCardStatusKey(event({ status }))).toBe(status)
})
it('multiday work remains active until its end and handles invalid dates', () => {
  expect(getEventCardStatusKey(event({ eventDate: '2026-09-01', dateEnd: '2026-10-03' }), new Date('2026-10-01'))).toBe('active')
  expect(getEventCardDateParts('bad')).toBeNull()
  expect(getEventCardDateParts()).toBeNull()
})
it('finance fixture: matches PWA totals, legacy deposit, refunds and obligation marker', () => {
  const rows = [transaction({ amount: 1000, category: 'advance' }), transaction({ amount: 3000, category: 'final_payment' }),
    transaction({ amount: 500, type: 'expense', category: 'refund' }), transaction({ amount: 200, type: 'expense', category: 'travel' }),
    transaction({ amount: 2000, paymentMethod: 'obligation', category: 'deposit' }),
    transaction({ amount: 700, type: 'expense', paymentMethod: 'obligation' })]
  expect(getEventCardFinance(event({ contractSum: 6000 }), rows)).toMatchObject({ paid: 6000, expense: 1400, net: 4600, depositPaid: 3000, contractSum: 6000, hasObligations: true })
  // Current PWA list sums all rows; the detail screen separately excludes obligations.
  const webIncome = rows.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0)
  const webExpense = rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0)
  expect({ paid: webIncome, expense: webExpense, net: webIncome - webExpense }).toEqual({ paid: 6000, expense: 1400, net: 4600 })
})
it('positive deposit/advance suppresses the PWA warning, including obligations', () => {
  const work = event({ waitDeposit: true, depositDueAt: '2026-09-01' })
  const now = new Date('2026-10-01')
  expect(getEventCardAttention(work, [transaction({ amount: 500, category: 'deposit', paymentMethod: 'obligation' })], now)).toBeNull()
  expect(getEventCardAttention(work, [transaction({ amount: 500, category: 'advance' })], now)).toBeNull()
})
