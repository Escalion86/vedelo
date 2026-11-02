import type { Client, Event } from '../domain/types'
const timestamp = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0
export function buildDeviceProjection(clients: Client[], events: Event[], lastSync?: string | null) {
  return {
    version: 1, syncedAt: timestamp(lastSync),
    clients: clients.map(client => ({ id: client._id,
      name: [client.firstName, client.secondName, client.thirdName].filter(Boolean).join(' ').trim(),
      phones: [client.phone, client.telegramPhone, client.whatsapp, client.viber].filter(phone => phone != null).map(phone => String(phone).trim()).filter(Boolean),
    })),
    events: events.filter(event => ['active', 'draft'].includes(event.status)).map(event => ({
      id: event._id, clientId: event.clientId, title: event.eventType || 'Работа', status: event.status,
      clientIds: [event.clientId, ...(event.otherContacts || []).map(contact => contact.clientId)].filter(Boolean),
      start: timestamp(event.eventDate), end: timestamp(event.dateEnd || event.eventDate),
      description: (event.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 240),
      tasks: (event.additionalEvents || []).filter(task => !task.done).map(task => ({ title: task.title || 'Следующий контакт', date: timestamp(task.date) })),
    })),
  }
}
