import type { Transaction } from '../../shared/domain/types'
import { TRANSACTION_CATEGORIES } from '../../shared/domain/finance'
import { plainComment } from '../clients/clientList'
const aliases: Record<string, string> = { advance: 'deposit', client_payment: 'final_payment', colleague_percent: 'referral_in' }
export const transactionCategory = (value?: string) => aliases[value?.trim() || ''] || value?.trim() || 'other'
export const transactionPresentation = (transaction: Transaction) => {
  const category = transaction.category ? TRANSACTION_CATEGORIES.find((item) => item.value === transactionCategory(transaction.category))?.label : ''
  const comment = plainComment(transaction.comment)
  const title = category || comment || 'Транзакция'
  const kind = transaction.paymentMethod === 'obligation' ? 'obligation' : transaction.type
  const amount = `${kind === 'obligation' ? '' : kind === 'income' ? '+' : '−'}${new Intl.NumberFormat('ru-RU').format(Number(transaction.amount || 0))} ₽`
  const method = ({ transfer: 'Перевод', account: 'Расчётный счёт', cash: 'Наличные', barter: 'Бартер', obligation: 'Обязательство' } as Record<string, string>)[transaction.paymentMethod || ''] || 'Способ не указан'
  const date = transaction.date ? new Date(transaction.date) : null
  const valid = date && Number.isFinite(date.getTime()) ? date : null
  return { kind, title, comment: comment !== title ? comment : '', method, amount, dateLabel: kind === 'obligation' ? 'Плановая дата' : 'Дата',
    day: valid ? String(valid.getDate()).padStart(2, '0') : '—', month: valid ? valid.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '') : '',
    weekday: valid ? valid.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '') : '',
    time: valid ? valid.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '',
  }
}
