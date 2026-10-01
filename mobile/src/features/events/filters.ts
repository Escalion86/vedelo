import type { Event } from '../../shared/domain/types'
import { isPastUnclosed } from '../attention/selectors'

export type EventsListScope = 'upcoming' | 'past'
export type StatusFilter = 'request' | 'active' | 'finished' | 'closed' | 'canceled'
export type PastPreset = '' | 'unclosed' | 'closed' | 'canceled'
// Read-only presentation fields already present in the sync payload; no persisted schema changes.
export type ListEvent = Event & {
  importedFromFile?: boolean
  fileImportChecked?: boolean
  clientData?: Record<string, unknown>
}
export type EventFiltersState = {
  town: string
  checked: 'all' | 'checked' | 'unchecked'
  statuses: StatusFilter[]
  transferred: 'all' | 'only' | 'exclude'
  preset: PastPreset
}
export const statusFilterKeys = (scope: EventsListScope): StatusFilter[] => scope === 'past'
  ? ['finished', 'closed', 'canceled'] : ['request', 'active', 'canceled']
export const defaultEventFilters = (scope: EventsListScope): EventFiltersState => ({
  town: '', checked: 'all', statuses: scope === 'past' ? ['finished', 'closed'] : ['request', 'active'],
  transferred: 'all', preset: '',
})
export const applyPastPreset = (filters: EventFiltersState, preset: PastPreset): EventFiltersState => ({
  ...filters, preset,
  statuses: preset === 'unclosed' ? ['finished'] : preset ? [preset] : defaultEventFilters('past').statuses,
  transferred: preset === 'unclosed' ? 'exclude' : 'all',
})
export const hasEventFilters = (scope: EventsListScope, filters: EventFiltersState) => {
  const defaults = defaultEventFilters(scope)
  return Boolean(filters.town || filters.checked !== 'all' || filters.transferred !== 'all' || filters.preset ||
    statusFilterKeys(scope).some((status) => filters.statuses.includes(status) !== defaults.statuses.includes(status)))
}
const timestamp = (value?: string | null): number | null => {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}
export const isEventImportChecked = (event: ListEvent) => event.importedFromFile
  ? event.fileImportChecked === true : Boolean(event.calendarImportChecked)
export const eventPublicApiSource = (event: ListEvent) => {
  const data = event.clientData
  if (!data) return ''
  const lead = data.lead && typeof data.lead === 'object' ? data.lead as Record<string, unknown> : {}
  const isApi = data.createdViaApi === true || lead.isPublicApi === true ||
    (lead.raw != null && typeof lead.raw === 'object' && ['source', 'phone', 'telegram', 'whatsapp', 'comment'].some((key) => lead[key] !== undefined))
  if (!isApi) return ''
  const label = data.sourceLabel || data.apiKeyName || lead.sourceLabel || lead.apiKeyName || data.source || lead.source
  return typeof label === 'string' && label.trim() ? label.trim() : 'API'
}
export const eventInScope = (event: Event, scope: EventsListScope, now: Date) => {
  const end = timestamp(event.dateEnd ?? event.eventDate)
  return end === null ? scope === 'upcoming' : scope === 'upcoming' ? end >= now.getTime() : end < now.getTime()
}
export const eventFilterStatus = (event: Event, now: Date): StatusFilter => {
  if (event.status === 'draft') return 'request'
  if (event.status === 'closed' || event.status === 'canceled') return event.status
  const end = timestamp(event.dateEnd ?? event.eventDate)
  return end !== null && end < now.getTime() ? 'finished' : 'active'
}
export const selectEvents = (events: readonly ListEvent[], scope: EventsListScope, filters: EventFiltersState, now: Date) => {
  // PWA's complete set means all statuses, including old drafts in the past scope.
  const allStatuses = statusFilterKeys(scope).every((key) => filters.statuses.includes(key))
  return events.filter((event) => {
    if (!eventInScope(event, scope, now)) return false
    if (filters.town && (event.address?.town ?? '').trim() !== filters.town) return false
    if (filters.checked !== 'all' && isEventImportChecked(event) !== (filters.checked === 'checked')) return false
    if (filters.transferred === 'only' && !event.isTransferred) return false
    if (filters.transferred === 'exclude' && event.isTransferred) return false
    if (scope === 'past' && filters.preset === 'unclosed' && !isPastUnclosed(event, now)) return false
    return allStatuses || filters.statuses.includes(eventFilterStatus(event, now))
  }).sort((a, b) => {
    const left = timestamp(a.eventDate), right = timestamp(b.eventDate)
    if (scope === 'past') return (right ?? 0) - (left ?? 0)
    const apiLeft = left === null && Boolean(eventPublicApiSource(a))
    const apiRight = right === null && Boolean(eventPublicApiSource(b))
    if (apiLeft !== apiRight) return apiLeft ? -1 : 1
    if ((left === null) !== (right === null)) return left === null ? 1 : -1
    return (left ?? 0) - (right ?? 0) || (timestamp(b.requestCreatedAt) ?? 0) - (timestamp(a.requestCreatedAt) ?? 0)
  })
}
