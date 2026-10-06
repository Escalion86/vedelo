import type { Transaction } from '../../shared/domain/types'

/** Транзакции связаны с работой строго через её идентификатор; пустой id не подставляет ничего. */
export const eventTransactionsFor = (transactions: Transaction[], eventId?: string | null) =>
  eventId ? transactions.filter((transaction) => transaction.eventId === eventId) : []

export const isObligationTransaction = (transaction: Transaction) =>
  transaction.paymentMethod === 'obligation'

// Обязательство — план, а не факт: оно не считается оплаченным задатком.
export const hasDepositPaidTransaction = (transactions: Transaction[]) =>
  transactions.some((transaction) =>
    !isObligationTransaction(transaction) &&
    transaction.type === 'income' &&
    ['deposit', 'advance'].includes(String(transaction.category || '')) &&
    Number(transaction.amount || 0) > 0
  )

export type EventTransactionSplit = {
  income: Transaction[]
  expense: Transaction[]
  obligations: Transaction[]
  totals: { income: number; expense: number; obligations: number }
}

export const splitEventTransactions = (transactions: Transaction[]): EventTransactionSplit => {
  const income = transactions.filter((transaction) => transaction.type === 'income' && !isObligationTransaction(transaction))
  const expense = transactions.filter((transaction) => transaction.type === 'expense' && !isObligationTransaction(transaction))
  const obligations = transactions.filter(isObligationTransaction)
  const sum = (items: Transaction[]) => items.reduce((total, item) => total + Number(item.amount || 0), 0)
  return { income, expense, obligations, totals: { income: sum(income), expense: sum(expense), obligations: sum(obligations) } }
}

/** Подпись даты как в текущем web: у обязательства это план, у остальных — факт. */
export const transactionDateLabel = (paymentMethod?: Transaction['paymentMethod']) =>
  paymentMethod === 'obligation' ? 'Плановая дата' : 'Дата'
