import { z } from 'zod'
const id = z.string().min(1)
const date = z.string().refine((value) => Number.isFinite(Date.parse(value))).nullable()
const amount = z.number().finite()
export const statisticsStatuses = ['all', 'draft', 'active', 'finished', 'closed', 'canceled'] as const
export type StatisticsStatus = typeof statisticsStatuses[number]
export type StatisticsFilters = { year: number | null; town: string; status: StatisticsStatus }
const payload = z.object({
  events: z.array(z.object({ _id: id, clientId: id.nullable(), eventType: z.string(), description: z.string(), eventDate: date, dateEnd: date, status: z.enum(['draft', 'active', 'canceled', 'closed']), contractSum: amount, address: z.object({ town: z.string(), street: z.string(), house: z.string() }) })),
  clients: z.array(z.object({ _id: id, firstName: z.string(), secondName: z.string() })),
  transactions: z.array(z.object({ _id: id, eventId: id.nullable(), clientId: id.nullable(), amount, type: z.enum(['income', 'expense']), category: z.string(), date, comment: z.string() })),
  filters: z.object({ year: z.number().int().nullable(), town: z.string(), status: z.enum(statisticsStatuses) }),
})
export type StatisticsPayload = z.infer<typeof payload>
export function readStatistics(response: unknown, filters: StatisticsFilters): StatisticsPayload {
  const result = z.object({ success: z.literal(true), data: payload }).safeParse(response)
  if (!result.success || result.data.data.filters.year !== filters.year || result.data.data.filters.town !== filters.town || result.data.data.filters.status !== filters.status) throw new Error('INVALID_STATISTICS')
  return result.data.data
}
export function statisticsPath(filters: StatisticsFilters) {
  const query = new URLSearchParams({ status: filters.status })
  if (filters.year !== null) query.set('year', String(filters.year))
  if (filters.town) query.set('town', filters.town)
  return `/mobile/v1/statistics?${query}`
}
export function calculateStatistics(data: StatisticsPayload) {
  const eventFinance = new Map(data.events.map((event) => [event._id, { income: 0, expense: 0 }]))
  let income = 0; let expense = 0; let taxes = 0; let commissions = 0
  const categories = new Map<string, number>()
  for (const transaction of data.transactions) {
    const amount = transaction.amount
    if (transaction.type === 'income') income += amount
    else {
      expense += amount
      if (transaction.category === 'taxes') taxes += amount
      if (['referral_out', 'organizer'].includes(transaction.category)) commissions += amount
      const category = transaction.category || 'other'
      categories.set(category, (categories.get(category) || 0) + amount)
    }
    const finance = transaction.eventId ? eventFinance.get(transaction.eventId) : null
    if (finance) finance[transaction.type] += amount
  }
  const paymentLeft = data.events.reduce((sum, event) => sum + Math.max(event.contractSum - (eventFinance.get(event._id)?.income || 0), 0), 0)
  return { income, expense, taxes, commissions, net: income - expense, margin: income > 0 ? ((income - expense) / income) * 100 : 0, paymentLeft, eventFinance,
    topExpenses: Array.from(categories, ([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5),
    topEvents: data.events.map((event) => { const finance = eventFinance.get(event._id)!; return { event, profit: finance.income - finance.expense } }).sort((a, b) => b.profit - a.profit).slice(0, 5) }
}
export const csvCell = (value: unknown) => {
  const text = String(value ?? '')
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
export function statisticsCsv(data: StatisticsPayload, workItemLabel: string) {
  const names = new Map(data.clients.map((client) => [client._id, [client.firstName, client.secondName].filter(Boolean).join(' ')]))
  const { eventFinance } = calculateStatistics(data)
  const rows = [
    ['Тип', 'ID', 'Дата', 'Клиент', 'Статус/категория', 'Сумма', 'Доход', 'Расход', 'Комментарий'],
    ...data.events.map((event) => { const finance = eventFinance.get(event._id)!; return [workItemLabel, event._id, event.eventDate || '', names.get(event.clientId || '') || '', event.status, event.contractSum, finance.income, finance.expense, event.description] }),
    ...data.transactions.map((tx) => ['Транзакция', tx._id, tx.date || '', names.get(tx.clientId || '') || '', tx.category || tx.type, tx.amount, tx.type === 'income' ? tx.amount : 0, tx.type === 'expense' ? tx.amount : 0, tx.comment]),
  ]
  return `\ufeff${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`
}
export const money = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)} ₽`
export const categoryLabel = (category: string) => ({ taxes: 'Налоги', referral_out: 'Реферальные выплаты', organizer: 'Комиссия организатора', services: 'Услуги и подрядчики', transport: 'Транспорт', advertising: 'Реклама', other: 'Прочее' }[category] || category)
