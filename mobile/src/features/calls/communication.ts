import type { Call, Client } from '../../shared/domain/types'

// Literal IDs: no trim, case conversion, coercion or local-ID substitution.
export const serverId = (value: unknown): value is string => typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value)
export const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
export const optionalText = (value: unknown) => value === undefined || typeof value === 'string'
export const optionalDate = (value: unknown) => value == null || typeof value === 'string' && Number.isFinite(new Date(value).getTime())
export const successfulData = (value: unknown): unknown => {
  if (!record(value) || value.success !== true || !('data' in value)) throw new Error('invalid_response')
  return value.data
}
export const checkedCall = (value: unknown, id?: string): Call => {
  if (!record(value) || !serverId(value._id) || (id !== undefined && value._id !== id)
    || !['new', 'processing', 'ready', 'linked', 'ignored', 'failed'].includes(String(value.status))
    || !['incoming', 'outgoing', 'unknown'].includes(String(value.direction))
    || [value.linkedClientId, value.linkedEventId].some((link) => link != null && !serverId(link))
    || ['phone', 'provider', 'transcript', 'aiSummary', 'callResultNote', 'processingError', 'recordingUrl', 'eventDecision'].some((key) => !optionalText(value[key]))
    || ['startedAt', 'endedAt', 'updatedAt', 'callResultAt', 'recordingExpiresAt'].some((key) => !optionalDate(value[key]))
    || value.durationSec !== undefined && (!Number.isFinite(value.durationSec) || Number(value.durationSec) < 0)
    || value.callResult !== undefined && !['', 'answered', 'no_answer', 'callback', 'follow_up'].includes(String(value.callResult))) throw new Error('invalid_call')
  if (value.aiExtractedFields !== undefined) {
    const fields = value.aiExtractedFields
    if (!record(fields) || ['clientName', 'eventType', 'eventCity', 'eventLocation', 'guestCount', 'nextContactReason'].some((key) => !optionalText(fields[key]))
      || !optionalDate(fields.eventDate) || !optionalDate(fields.nextContactAt)
      || fields.budget != null && !Number.isFinite(fields.budget)
      || fields.objections !== undefined && (!Array.isArray(fields.objections) || fields.objections.some((item) => typeof item !== 'string'))) throw new Error('invalid_fields')
  }
  return value as Call
}
export const callStatusLabel = (status?: Call['status']) => ({ new: 'Новый', processing: 'Обработка', ready: 'Готов', linked: 'Связан', ignored: 'Не клиент', failed: 'Ошибка' }[status || 'new'])
export const directionLabel = (direction?: Call['direction']) => direction === 'incoming' ? 'Входящий' : direction === 'outgoing' ? 'Исходящий' : 'Неизвестно'
export const localDateLabel = (value?: string | null) => {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Дата не указана'
}
export const durationLabel = (seconds?: number) => Number.isFinite(seconds) && Number(seconds) >= 0 ? `${Math.floor(Number(seconds) / 60)} мин ${Math.floor(Number(seconds) % 60)} сек` : 'Длительность не указана'
export const clientLabel = (client: Client) => [client.firstName, client.secondName, client.thirdName].filter(Boolean).join(' ') || String(client.phone || 'Клиент')
// Only complete RU numbers in a phone-shaped input may be used for a suggestion.
export const phoneDigits = (value: unknown): string | null => {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\+?[\d ()-]+$/.test(String(value))) return null
  const digits = String(value).replace(/\D/g, '')
  if (!/^[78]\d{10}$/.test(digits)) return null
  return `7${digits.slice(1)}`
}
export const suggestedClient = (call: Call, clients: Client[]) => {
  if (call.linkedClientId) return clients.find((item) => item._id === call.linkedClientId) || null
  const phone = phoneDigits(call.phone)
  if (!phone) return null
  const matches = clients.filter((item) => serverId(item._id) && phoneDigits(item.phone) === phone)
  return matches.length === 1 ? matches[0] : null
}
export const safeHttpUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || /[\s\u0000-\u001f]/.test(value)) return null
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? value : null } catch { return null }
}
export const parseContactDate = (value: string): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null
  const date = new Date(year, month - 1, day, hour, minute, 0, 0)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute ? date.toISOString() : null
}
export const tomorrowAtTen = () => {
  const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(10, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 10:00`
}
export const communicationError = (reason: unknown, fallback: string) => {
  const status = record(reason) ? reason.status : undefined
  return status === 403 ? 'Нет доступа или функция недоступна на текущем тарифе.' : status === 404 ? 'Запись не найдена или больше недоступна.' : fallback
}
