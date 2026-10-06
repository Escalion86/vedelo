import type { Transaction } from '../../shared/domain/types'
import {
  eventTransactionsFor,
  hasDepositPaidTransaction,
  splitEventTransactions,
  transactionDateLabel,
} from './eventFinance'

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  _id: 'transaction',
  eventId: 'local-event',
  amount: 100,
  type: 'income',
  date: '2026-10-01',
  ...overrides,
})

describe('транзакции только текущей работы', () => {
  it('оставляет только транзакции с точным eventId и не подставляет чужие при пустом id', () => {
    const items = [
      transaction({ _id: 'mine', eventId: 'local-event' }),
      transaction({ _id: 'foreign', eventId: 'other-event' }),
      transaction({ _id: 'orphan', eventId: null }),
      transaction({ _id: 'stale', eventId: 'local-event-2' }),
    ]
    expect(eventTransactionsFor(items, 'local-event').map((item) => item._id)).toEqual(['mine'])
    expect(eventTransactionsFor(items, '')).toEqual([])
    expect(eventTransactionsFor(items, undefined)).toEqual([])
    expect(eventTransactionsFor(items, null)).toEqual([])
  })

  it('разделяет факт и обязательства: обязательства не входят в поступления и расходы', () => {
    const items = [
      transaction({ _id: 'income', type: 'income', amount: 5000, category: 'deposit' }),
      transaction({ _id: 'expense', type: 'expense', amount: 700, category: 'travel' }),
      transaction({ _id: 'obligation-in', type: 'income', amount: 30000, paymentMethod: 'obligation', category: 'final_payment' }),
      transaction({ _id: 'obligation-out', type: 'expense', amount: 1000, paymentMethod: 'obligation', category: 'taxes' }),
      transaction({ _id: 'canceled', type: 'income', amount: 999, category: 'other' }),
    ]
    const split = splitEventTransactions(items)
    expect(split.income.map((item) => item._id)).toEqual(['income', 'canceled'])
    expect(split.expense.map((item) => item._id)).toEqual(['expense'])
    expect(split.obligations.map((item) => item._id)).toEqual(['obligation-in', 'obligation-out'])
    expect(split.totals).toEqual({ income: 5999, expense: 700, obligations: 31000 })
  })

  it('не считает обязательство фактом при поиске оплаченного задатка', () => {
    expect(hasDepositPaidTransaction([])).toBe(false)
    // Обязательство отделено от факта: план не скрывает ожидание задатка.
    expect(hasDepositPaidTransaction([
      transaction({ _id: 'obligation', type: 'income', amount: 5000, category: 'deposit', paymentMethod: 'obligation' }),
    ])).toBe(false)
    expect(hasDepositPaidTransaction([
      transaction({ _id: 'zero', type: 'income', amount: 0, category: 'deposit' }),
    ])).toBe(false)
    expect(hasDepositPaidTransaction([
      transaction({ _id: 'expense', type: 'expense', amount: 5000, category: 'deposit' }),
    ])).toBe(false)
    expect(hasDepositPaidTransaction([
      transaction({ _id: 'advance', type: 'income', amount: 1, category: 'advance' }),
      transaction({ _id: 'tips', type: 'income', amount: 9999, category: 'tips' }),
    ])).toBe(true)
  })

  it('подписывает дату исполнения или плановую дату как в web', () => {
    expect(transactionDateLabel('obligation')).toBe('Плановая дата')
    expect(transactionDateLabel('cash')).toBe('Дата')
    expect(transactionDateLabel(undefined)).toBe('Дата')
  })
})
