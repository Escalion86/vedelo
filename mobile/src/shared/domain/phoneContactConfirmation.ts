import type { Client } from './types'
import { getCachedEntity } from '../storage/cache'
import { saveLocalEntity } from '../storage/mutations'

// Read the current tenant cache before queuing a minimal patch. Never recreate a
// removed client or confirm a phone/contact changed while the external app was open.
export async function confirmPhoneContact(client: Client, provider: 'whatsapp' | 'telegram' | 'max', phone: string, confirmed: boolean) {
  const current = await getCachedEntity<Client>('clients', client._id)
  const field = { whatsapp: 'whatsapp', telegram: 'telegramPhone', max: 'max' } as const
  if (!current || String(current.phone) !== String(client.phone) ||
    current[field[provider]] !== client[field[provider]] || current.telegram !== client.telegram) {
    throw new Error('Контакт изменился')
  }
  const patch: Partial<Client> = {
    [`${provider}PhoneUnavailable`]: !confirmed,
    ...(confirmed ? { [field[provider]]: provider === 'max' ? phone : current.phone } : {}),
  }
  await saveLocalEntity({ entityType: 'clients', entityId: client._id, values: patch })
  return patch
}
