import { z } from 'zod'
import type { resolveMobileWorkItemTerminology } from '../../shared/domain/workItemTerminology'

const id = z.string().min(1)
const text = z.string().nullable().optional()
const relation = id.nullable().optional()
const phone = z.union([z.string(), z.number().finite()]).nullable().optional()
const amount = z.number().finite().nullable().optional()
// Project only CSV fields; private documents, integration fields and other
// collection properties are never retained in export state.
export const exportSchemas = {
  events: z.object({ _id: id, clientId: relation, eventDate: text, dateEnd: text, createdAt: text, phone, status: text, contractSum: amount,
    servicesIds: z.array(id).nullable().optional(), address: z.object({ town: text, street: text, house: text, flat: text, entrance: text, floor: text, comment: text }).nullable().optional() }),
  clients: z.object({ _id: id, firstName: text, secondName: text, thirdName: text, phone }),
  services: z.object({ _id: id, title: text }),
  transactions: z.object({ _id: id, eventId: relation, clientId: relation, amount, type: z.enum(['income', 'expense']), category: text, date: text, comment: text }),
}
export type ExportData = { [K in keyof typeof exportSchemas]: z.infer<typeof exportSchemas[K]>[] }
export type ExportKey = 'events' | 'requests' | 'transactions'
export type ExportDataset = { headers: string[]; rows: Record<string, string | number | null | undefined>[] }
export type ExportDatasets = Record<ExportKey, ExportDataset>
export type ExportTerms = Pick<ReturnType<typeof resolveMobileWorkItemTerminology>, 'genitive' | 'instrumental' | 'labelCapitalized' | 'pluralCapitalized'>
export const exportKeys: ExportKey[] = ['events', 'requests', 'transactions']
export const UNAVAILABLE = 'Недоступно'

export function exportDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const addressText = (address: ExportData['events'][number]['address']) => {
  if (!address?.town && !address?.street) return address?.comment || ''
  return [address.town, address.street, address.house ? `д.${address.house}` : '', address.flat ? `кв.${address.flat}` : '', address.entrance ? `под.${address.entrance}` : '', address.floor ? `${address.floor} этаж` : ''].filter(Boolean).join(', ') + (address.comment ? ` (${address.comment})` : '')
}
const labels: Record<string, string> = { draft: 'Заявка', active: 'Активно', canceled: 'Отменено', finished: 'Завершено', closed: 'Закрыто' }
const computedStatus = (event: ExportData['events'][number], now: number) => {
  if (['draft', 'canceled', 'closed'].includes(event.status || '')) return event.status!
  const date = event.dateEnd ?? event.eventDate
  if (!date || Number.isNaN(new Date(date).getTime())) return event.status || 'active'
  return new Date(date).getTime() < now ? 'finished' : 'active'
}

/** Matches helpers/csvExport.js buildExportDatasets, including obligations.
 * Undefined service IDs/date of request/phone are marked, never fabricated. */
export function buildExportDatasets(data: ExportData, terms: ExportTerms, now = Date.now()): ExportDatasets {
  const events = new Map(data.events.map(e => [e._id, e])), clients = new Map(data.clients.map(c => [c._id, c])), services = new Map(data.services.map(s => [s._id, s]))
  const finance = new Map<string, { income: number; expense: number }>()
  for (const tx of data.transactions) {
    if (!tx.eventId) continue
    const sum = finance.get(tx.eventId) || { income: 0, expense: 0 }
    sum[tx.type] += Number(tx.amount ?? 0); finance.set(tx.eventId, sum)
  }
  const clientName = (clientId?: string | null) => {
    if (!clientId) return ''
    const c = clients.get(clientId)
    return c ? [c.firstName, c.secondName, c.thirdName].map(s => s?.trim() || '').filter(Boolean).join(' ') || clientId : clientId
  }
  const serviceTitles = (ids?: string[] | null) => ids === undefined ? UNAVAILABLE : (ids || []).map(id => services.get(id)?.title ?? id).filter(Boolean).join(', ')
  const clientPhone = (e: ExportData['events'][number]) => {
    if (e.phone) return String(e.phone)
    const c = e.clientId ? clients.get(e.clientId) : undefined
    if (c?.phone) return `+${c.phone}`
    return e.phone === undefined && (!c || c.phone === undefined) ? UNAVAILABLE : ''
  }
  const dateHeader = `Дата ${terms.genitive}`, linkedHeader = `Связано с ${terms.instrumental}`
  return {
    events: { headers: ['ID', 'Дата начала', 'Дата окончания', 'Клиент', 'Город', 'Адрес', 'Услуги', 'Статус', 'Договорная сумма', 'Доход', 'Расход', 'Прибыль'],
      rows: data.events.filter(e => e.status !== 'draft').map(e => {
        const sum = finance.get(e._id) || { income: 0, expense: 0 }
        return { ID: e._id, 'Дата начала': exportDate(e.eventDate), 'Дата окончания': exportDate(e.dateEnd), Клиент: clientName(e.clientId), Город: e.address?.town || '', Адрес: addressText(e.address), Услуги: serviceTitles(e.servicesIds), Статус: labels[computedStatus(e, now)] || e.status || '', 'Договорная сумма': Number(e.contractSum ?? 0), Доход: sum.income, Расход: sum.expense, Прибыль: sum.income - sum.expense }
      }) },
    requests: { headers: ['ID', 'Дата заявки', dateHeader, 'Клиент', 'Телефон', 'Город', 'Адрес', 'Услуги', 'Статус', 'Договорная сумма', linkedHeader],
      rows: data.events.filter(e => e.status === 'draft').map(e => ({ ID: e._id, 'Дата заявки': e.createdAt === undefined ? UNAVAILABLE : exportDate(e.createdAt), [dateHeader]: exportDate(e.eventDate), Клиент: clientName(e.clientId), Телефон: clientPhone(e), Город: e.address?.town || '', Адрес: addressText(e.address), Услуги: serviceTitles(e.servicesIds), Статус: e.status || '', 'Договорная сумма': Number(e.contractSum ?? 0), [linkedHeader]: 'Нет' })) },
    transactions: { headers: ['ID', 'Дата', 'Тип', 'Категория', 'Сумма', 'Клиент', terms.labelCapitalized, 'Комментарий'],
      rows: data.transactions.map(tx => {
        const e = tx.eventId ? events.get(tx.eventId) : undefined
        return { ID: tx._id, Дата: exportDate(tx.date), Тип: tx.type, Категория: tx.category || '', Сумма: Number(tx.amount ?? 0), Клиент: clientName(tx.clientId), [terms.labelCapitalized]: e ? [serviceTitles(e.servicesIds), addressText(e.address)].filter(Boolean).join(' • ') : '', Комментарий: tx.comment || '' }
      }) },
  }
}

export function unavailableColumns(datasets: ExportDatasets, selected: ExportKey[]) {
  return [...new Set(selected.flatMap(key => datasets[key].headers.filter(h => datasets[key].rows.some(row => row[h] === UNAVAILABLE || String(row[h] || '').startsWith(`${UNAVAILABLE} •`)))))]
}
export function exportCsv(dataset: ExportDataset) {
  const cell = (value: string | number | null | undefined) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('INVALID_EXPORT_NUMBER')
    let text = String(value ?? '')
    // Text cells only: real negative numbers remain numbers. Leading whitespace
    // and invisible controls cannot hide a formula from spreadsheet importers.
    if (typeof value !== 'number' && /^[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\ufeff]*[=+@-]/u.test(text)) text = `'${text}`
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return '\ufeff' + [dataset.headers.map(cell).join(';'), ...dataset.rows.map(row => dataset.headers.map(h => cell(row[h])).join(';'))].join('\r\n')
}
