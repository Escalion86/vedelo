import * as WebBrowser from 'expo-web-browser'
import { api } from '../../shared/api/client'
import { env } from '../../shared/config/env'
import { getAuthSessionEpoch } from '../../shared/auth/tokenStore'
import { readOAuthUrl } from '../integrations/integrationContract'

export type CalendarImportStatus = { allowCalendarSync: boolean; allowAi: boolean; connected: boolean; calendarId: string; calendarName: string }
export type CalendarSource = { id: string; summary: string }
export type CalendarCandidate = { id: string; title: string; eventDate: string; location: string; descriptionPreview: string; needsAi: boolean; alreadyImported: boolean; canceled: boolean }
export type CalendarPreview = { calendarId: string; calendarName: string; candidates: CalendarCandidate[]; maxEvents: number; batchSize: number; quote: { billingMode: string; costPerEvent: number; balance: number | null; platformConfigured: boolean } }
export type CalendarRange = { timeMin: string; timeMax: string }
export type CalendarResult = { id: string; title: string; status: string; eventId?: string; warnings?: string[]; error?: string }
export type CalendarImportRequest = CalendarRange & { eventIds: string[]; groupId: string; calendarId: string }
const data = <T>(response: { success?: boolean; data?: T }): T => {
  if (!response?.success || !response.data || typeof response.data !== 'object') throw new Error('INVALID_IMPORT_RESPONSE')
  return response.data
}
export const getCalendarImportStatus = async () => {
  const result = data(await api.get<{ success: boolean; data: CalendarImportStatus }>('/google-calendar/import-status'))
  if (typeof result.connected !== 'boolean' || typeof result.allowAi !== 'boolean' || typeof result.allowCalendarSync !== 'boolean' || typeof result.calendarId !== 'string') throw new Error('INVALID_IMPORT_STATUS')
  return result
}
export const getImportCalendars = async () => {
  const result = data(await api.get<{ success: boolean; data: { calendars: CalendarSource[] } }>('/google-calendar/import-calendars'))
  if (!Array.isArray(result.calendars) || result.calendars.some(c => typeof c.id !== 'string' || typeof c.summary !== 'string')) throw new Error('INVALID_CALENDARS')
  return result.calendars
}
export const selectImportCalendar = (calendarId: string) => api.post('/google-calendar/import-select', { calendarId }, { skipRefresh: true })
export const disconnectImportCalendar = () => api.post('/google-calendar/import-disconnect', {}, { skipRefresh: true })
export const calendarRange = (from: string, to: string): CalendarRange => {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Укажите даты в формате ГГГГ-ММ-ДД')
    const date = new Date(`${value}T00:00:00`)
    if (!Number.isFinite(date.getTime()) || date.getFullYear() !== Number(value.slice(0, 4)) || date.getMonth() + 1 !== Number(value.slice(5, 7)) || date.getDate() !== Number(value.slice(8))) throw new Error('Укажите существующую дату')
    return date
  }
  const start = parse(from), end = parse(to); end.setDate(end.getDate() + 1)
  if (start >= end || (end.getTime() - start.getTime()) / 86_400_000 > 366) throw new Error('Выберите период не длиннее 366 дней; окончание не раньше начала')
  return { timeMin: start.toISOString(), timeMax: end.toISOString() }
}
export const previewImportCalendar = async (range: CalendarRange) => {
  const result = data(await api.get<{ success: boolean; data: CalendarPreview }>(`/events/google-import?${new URLSearchParams(range)}`))
  if (!Array.isArray(result.candidates) || result.candidates.some(c => !c.id || typeof c.id !== 'string' || typeof c.needsAi !== 'boolean') || !result.calendarId || !Number.isFinite(result.quote?.costPerEvent) || result.quote.costPerEvent < 0 || !Number.isInteger(result.batchSize) || result.batchSize < 1 || result.batchSize > 10 || !Number.isInteger(result.maxEvents) || result.maxEvents < 1 || result.maxEvents > 100) throw new Error('INVALID_IMPORT_PREVIEW')
  return result
}
export const importCalendarBatch = async (request: CalendarImportRequest) => {
  const { timeMin, timeMax, eventIds, groupId, calendarId } = request
  const result = data(await api.post<{ success: boolean; data: { results: CalendarResult[]; actualCost: number } }>('/events/google-import', { timeMin, timeMax, eventIds, groupId, calendarId }, { skipRefresh: true }))
  if (!Array.isArray(result.results) || !Number.isFinite(result.actualCost) || result.results.some(r => !request.eventIds.includes(r.id) || typeof r.status !== 'string')) throw new Error('INVALID_IMPORT_RESULT')
  return result
}
export const connectImportCalendar = async (current: () => boolean) => {
  const epoch = getAuthSessionEpoch(), active = () => current() && epoch === getAuthSessionEpoch()
  const url = readOAuthUrl(await api.get(`/mobile/v1/integrations/google-calendar/auth-url?purpose=import&appScheme=${encodeURIComponent(env.appScheme)}`))
  if (!active()) return
  const returned = await WebBrowser.openAuthSessionAsync(url, `${env.appScheme}://more/import`)
  if (!active() || returned.type !== 'success') return
  const callback = new URL(returned.url)
  if (callback.protocol !== `${env.appScheme}:` || callback.hostname !== 'more' || callback.pathname !== '/import' || callback.port || callback.username || callback.password || callback.hash || [...callback.searchParams.keys()].join() !== 'gc_import_connected' || callback.searchParams.get('gc_import_connected') !== '1') throw new Error('GOOGLE_IMPORT_CONNECT_FAILED')
  // Caller always reads authenticated server state; a URL is no proof.
}
