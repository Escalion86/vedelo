import { api } from '../../shared/api/client'
export const paymentCategories = [ ['all', 'Все'], ['tariff', 'Тарифы'], ['topup', 'Пополнения'], ['bonus', 'Бонусы'], ['refund', 'Возвраты'], ['charge', 'Списания'] ] as const
export type PaymentCategory = typeof paymentCategories[number][0]
export type PaymentItem = { id: string; amount: number; direction: 'in' | 'out'; type: 'topup' | 'charge' | 'refund'; kind: string; status: 'pending' | 'succeeded' | 'canceled' | 'failed'; title: string; details: string; sourceTitle: string; methodTitle: string; receiptUrl: string; occurredAt: string | null }
import { safeHttps } from '../profile/presentation'
export { safeHttps, paymentDate } from '../profile/presentation'
export const paymentStatus = { pending: 'Ожидает подтверждения', succeeded: 'Проведено', canceled: 'Отменено', failed: 'Ошибка' }
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const invalid = () => new Error('Не удалось обработать историю операций')
export const readPaymentPage = (payload: unknown) => {
  const response = object(payload), data = object(response.data), meta = object(response.meta)
  if (response.success !== true || !Array.isArray(data.items) || typeof meta.hasMore !== 'boolean' || (meta.hasMore && (typeof meta.nextCursor !== 'string' || !meta.nextCursor))) throw invalid()
  const items = data.items.map((raw): PaymentItem => {
    const row = object(raw)
    if (typeof row.id !== 'string' || !row.id || typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount < 0 || !['in','out'].includes(String(row.direction)) || !['topup','charge','refund'].includes(String(row.type)) || !['pending','succeeded','canceled','failed'].includes(String(row.status))) throw invalid()
    for (const field of ['kind','title','details','sourceTitle','methodTitle']) if (typeof row[field] !== 'string') throw invalid()
    // Copy only the user DTO. Management, account identifiers and referral internals are discarded.
    return { id: row.id, amount: row.amount, direction: row.direction as PaymentItem['direction'], type: row.type as PaymentItem['type'], status: row.status as PaymentItem['status'], kind: row.kind as string, title: row.title as string, details: row.details as string, sourceTitle: row.sourceTitle as string, methodTitle: row.methodTitle as string, receiptUrl: safeHttps(row.receiptUrl), occurredAt: typeof row.occurredAt === 'string' ? row.occurredAt : null }
  })
  return { items, cursor: meta.hasMore ? meta.nextCursor as string : null }
}
export const getPaymentPage = async (category: PaymentCategory, cursor?: string) => {
  if (!paymentCategories.some(([key]) => key === category)) throw invalid()
  const params = new URLSearchParams({ category, limit: '30' })
  if (cursor) params.set('cursor', cursor)
  return readPaymentPage(await api.get(`/billing/history?${params}`))
}
export const mergePayments = (previous: PaymentItem[], next: PaymentItem[]) => [...new Map([...previous, ...next].map((item) => [item.id, item])).values()]
