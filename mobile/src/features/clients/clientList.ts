import type { Client, Event } from '../../shared/domain/types'

export type ClientFilter = 'all' | 'requests' | 'events' | 'canceled'
export const clientName = (client: Client) => [client.secondName, client.firstName, client.thirdName].map((part) => part?.trim()).filter(Boolean).join(' ') || 'Без имени'
export const contactChannelLabel = (client: Client) => client.preferredContactChannel === 'other'
  ? client.preferredContactChannelOther?.trim() || 'Другое'
  : ({ phone: 'Телефон', telegram: 'Telegram', whatsapp: 'WhatsApp', max: 'MAX', vk: 'VK' } as Record<string, string>)[client.preferredContactChannel || ''] || ''
export const plainComment = (value?: string) => (value || '')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?\s*>|<\/p\s*>|<\/div\s*>/gi, '\n').replace(/<[^>]*>/g, '')
  .replace(/&(nbsp|amp|lt|gt|quot|apos);/g, (_, key: string) => ({ nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[key] || '')
  .replace(/\n\s*\n/g, '\n').trim()
const dateTime = (value?: string | null) => { const time = value ? new Date(value).getTime() : 0; return Number.isFinite(time) ? time : 0 }
export const clientSummary = (clientId: string, events: Event[], now = new Date()) => {
  const related = events.filter((event) => event.clientId === clientId)
  const counts = { requests: 0, active: 0, finished: 0, closed: 0, canceled: 0 }
  for (const event of related) {
    if (event.status === 'draft') counts.requests += 1
    else if (event.status === 'canceled') counts.canceled += 1
    else if (event.status === 'closed') counts.closed += 1
    else if (dateTime(event.dateEnd ?? event.eventDate) && dateTime(event.dateEnd ?? event.eventDate) < now.getTime()) counts.finished += 1
    else counts.active += 1
  }
  const requestDate = (event: Event) => dateTime(event.requestCreatedAt ?? event.createdAt ?? event.eventDate)
  const sorted = related.filter((event) => requestDate(event) !== 0).sort((a, b) => requestDate(b) - requestDate(a))
  return { counts, latest: sorted[0] || null, lastDate: sorted[0] ? requestDate(sorted[0]) : 0, total: related.length }
}
export const selectClients = (clients: Client[], events: Event[], search: string, filter: ClientFilter, now = new Date()) => {
  const summaries = new Map(clients.map((client) => [client._id, clientSummary(client._id, events, now)]))
  const query = search.trim().toLowerCase()
  const digits = query.replace(/\D/g, '')
  return clients.filter((client) => {
    const summary = summaries.get(client._id)!
    if (filter === 'requests' && !summary.counts.requests) return false
    if (filter === 'events' && !summary.counts.active) return false
    if (filter === 'canceled' && !summary.counts.canceled) return false
    const contacts = [client.phone, client.whatsapp, client.telegramPhone, client.viber, client.telegram, client.email, client.vk, client.instagram, client.max]
    const textMatch = [clientName(client), ...contacts].some((value) => String(value || '').toLowerCase().includes(query))
    const phoneMatch = digits.length > 0 && [client.phone, client.whatsapp, client.telegramPhone, client.viber, client.telegram, client.max].some((value) => String(value || '').replace(/\D/g, '').includes(digits))
    return !query || textMatch || phoneMatch
  }).sort((a, b) => {
    const left = summaries.get(a._id)!, right = summaries.get(b._id)!
    if (left.lastDate || right.lastDate) return right.lastDate - left.lastDate
    return right.counts.requests - left.counts.requests
  })
}
