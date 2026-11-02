import type { Client } from '../domain/types'
import { listCachedEntities } from '../storage/cache'
import { saveLocalEntity } from '../storage/mutations'
import { assertLocalEntityIdentity, localEntityIdentity } from '../storage/localEntityIds'
import type { PhoneContact } from './device'

export const normalizeDevicePhone = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length === 10 ? `7${digits}` : digits.length === 11 && digits[0] === '8' ? `7${digits.slice(1)}` : digits
}
export function contactDuplicates(contact: PhoneContact, clients: Client[]) {
  const phones = new Set(contact.phones.map(normalizeDevicePhone).filter(Boolean))
  return clients.filter(client => [client.phone, client.telegramPhone, client.whatsapp, client.viber]
    .some(phone => phones.has(normalizeDevicePhone(phone))))
}
export type ContactSelection = { contact: PhoneContact; primary: string; keepAdditional: boolean }
let importing = false
export async function importSelectedContacts(selections: ContactSelection[]) {
  if (importing) throw new Error('Импорт уже выполняется')
  importing = true
  const result: { created: string[]; duplicates: string[] } = { created: [], duplicates: [] }
  try {
    const identity = await localEntityIdentity()
    for (const selection of selections) {
      if (!selection.contact.phones.includes(selection.primary)) throw new Error('Выберите основной номер контакта')
      const number = normalizeDevicePhone(selection.primary)
      if (number.length < 7 || number.length > 15) throw new Error('Проверьте номер телефона')
      await assertLocalEntityIdentity(identity)
      const clients = await listCachedEntities<Client>('clients')
      if (contactDuplicates(selection.contact, clients).length) { result.duplicates.push(selection.contact.id); continue }
      const additional = selection.contact.phones.filter(phone => normalizeDevicePhone(phone) !== number)
      await assertLocalEntityIdentity(identity)
      const created = await saveLocalEntity({ entityType: 'clients', values: {
        firstName: selection.contact.name.trim() || `Контакт +${number}`, phone: number,
        ...(selection.keepAdditional && additional.length ? { comment: `Дополнительные телефоны: ${additional.join(', ')}` } : {}),
      } })
      result.created.push(created._id)
    }
    return result
  } finally { importing = false }
}
