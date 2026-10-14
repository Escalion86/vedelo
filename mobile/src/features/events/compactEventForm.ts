import type { EventDraft } from '../../shared/domain/eventForm'
import type { Client } from '../../shared/domain/types'
import { getEventCardClientName } from './eventCard'

export type CompactSectionId = 'client' | 'services' | 'dates' | 'location' | 'finance' | 'tasks' | 'documents' | 'details' | 'status'
export const compactFieldGroups: Record<CompactSectionId, readonly string[]> = {
  client: ['clientId', 'description'], services: ['servicesIds', 'eventType'], dates: ['eventDate', 'dateEnd'],
  location: ['town', 'street', 'house', 'entrance', 'floor', 'flat', 'addressComment'],
  finance: ['contractSum', 'waitDeposit', 'depositExpectedAmount', 'depositDueAt', 'isByContract', 'financeComment'],
  tasks: [], documents: [], details: ['isTransferred', 'colleagueId', 'requestCreatedAt', 'fileImportChecked', 'calendarImportChecked'], status: ['status', 'cancelReason'],
}
export const transferSummary = (draft: EventDraft, clients: Client[]) => {
  if (!draft.values.isTransferred) return ''
  const colleague = clients.find(client => client._id === draft.values.colleagueId)
  return colleague ? `Передано: ${getEventCardClientName(colleague)}` : 'Передано коллеге'
}
export const clientSummary = (draft: EventDraft, clients: Client[]) => [
  draft.values.clientId ? clients.some(client => client._id === draft.values.clientId) ? getEventCardClientName(clients.find(client => client._id === draft.values.clientId)) : 'Клиент недоступен на устройстве' : 'Клиент не выбран',
  draft.otherContacts.length ? `Прочих контактов: ${draft.otherContacts.length}` : '',
].filter(Boolean).join(' · ')
export const validationSection = (message: string): CompactSectionId => {
  if (/коллег|передач|дата заявки/i.test(message)) return 'details'
  if (/клиент|контакт недоступен|дополнительн|повторяться/i.test(message)) return 'client'
  if (/следующего контакта|срок контакта/i.test(message)) return 'tasks'
  if (/статус|причину отмены/i.test(message)) return 'status'
  if (/сумм|задат/i.test(message)) return 'finance'
  return 'dates'
}
