import type { ExportData } from './exportDatasets'
import { resolveMobileWorkItemTerminology } from '../../shared/domain/workItemTerminology'
export const exportTerms = resolveMobileWorkItemTerminology({ _id: 'settings', custom: { primaryEntityTerminology: 'orders' } })
export const exportFixture = (): ExportData => ({
  events: [
    { _id: 'work', clientId: 'client', eventDate: '2025-12-31T23:30:00Z', dateEnd: '2026-01-02T09:00:00Z', status: 'active', contractSum: 1250.75, servicesIds: ['service', 'removed'], address: { town: 'Красноярск', street: 'Ленина', house: '7', flat: '3', entrance: '2', floor: '5', comment: 'Вход справа' } },
    { _id: 'request', clientId: 'client', createdAt: '2026-01-01T06:00:00Z', eventDate: null, status: 'draft', servicesIds: [], phone: null, contractSum: 200, address: { comment: 'Адрес позже' } },
    { _id: 'closed', status: 'closed', servicesIds: [], contractSum: 0, address: {} },
    { _id: 'canceled', status: 'canceled', servicesIds: ['service'], address: { town: 'Москва' } },
    { _id: 'future', clientId: 'deleted', status: 'active', servicesIds: [], eventDate: '2030-01-01T00:00:00Z' },
  ],
  clients: [{ _id: 'client', firstName: ' Анна ', secondName: 'Иванова', thirdName: 'Петровна', phone: 79991234567 }],
  services: [{ _id: 'service', title: 'Услуга; "А"' }],
  transactions: [
    { _id: 'income', eventId: 'work', clientId: 'client', type: 'income', amount: 700.5, category: 'services', date: '2026-01-01T07:00:00Z', comment: 'Первая строка\nВторая "строка";' },
    { _id: 'expense', eventId: 'work', type: 'expense', amount: 200.25 },
    { _id: 'obligation', eventId: 'work', type: 'income', amount: 100.25 },
    { _id: 'orphan', eventId: 'deleted', clientId: 'deleted', type: 'expense', amount: 7, category: 'other' },
    { _id: 'unlinked', type: 'income', amount: 3 },
  ],
})
export function exportDeferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
export const flushExport = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
