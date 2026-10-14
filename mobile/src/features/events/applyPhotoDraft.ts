import { formatEventDateInput, type EventDraft } from '../../shared/domain/eventForm'
import { applyVoiceDraftFields } from './voiceDraft'
import type { PhotoDraftFields } from './PhotoDraftSection'

export function applyPhotoDraft(current: EventDraft, fields: PhotoDraftFields, clientIds: Set<string>, serviceIds: Set<string>): EventDraft {
  const values = applyVoiceDraftFields(current.values, fields, clientIds)
  // Фото переносит денежные значения без округления до целых рублей.
  for (const field of ['contractSum', 'depositExpectedAmount'] as const) {
    const amount = fields[field]
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) {
      values[field] = String(amount)
    }
  }
  if (typeof fields.isByContract === 'boolean') values.isByContract = fields.isByContract
  if (typeof fields.financeComment === 'string') values.financeComment = fields.financeComment.trim().slice(0, 500)
  if (typeof fields.address?.comment === 'string') values.addressComment = fields.address.comment.trim().slice(0, 500)
  return { ...current, values, serviceIds: Array.isArray(fields.servicesIds)
    ? [...new Set(fields.servicesIds.filter((id): id is string => typeof id === 'string' && serviceIds.has(id)))] : current.serviceIds }
}

/** Только реально принимаемые поля, без служебных/невалидных значений DTO. */
export function photoDraftHighlights(fields: PhotoDraftFields, requested: string[], clientIds: ReadonlySet<string>, serviceIds: ReadonlySet<string>) {
  const result = new Set<string>()
  for (const key of requested) {
    if (key === 'address') {
      for (const [input, output] of [['town', 'town'], ['street', 'street'], ['house', 'house'], ['comment', 'addressComment']] as const) {
        const value = fields.address?.[input]
        if (typeof value === 'string' && value.trim()) result.add(output)
      }
    } else if (key === 'servicesIds') {
      if (Array.isArray(fields.servicesIds) && fields.servicesIds.some(id => typeof id === 'string' && serviceIds.has(id))) result.add(key)
    } else if (key === 'clientId') {
      if (typeof fields.clientId === 'string' && clientIds.has(fields.clientId)) result.add(key)
    } else if (key === 'eventDate' || key === 'dateEnd') {
      const value = fields[key]
      if (typeof value === 'string' && formatEventDateInput(value)) result.add(key)
    } else if (key === 'contractSum' || key === 'depositExpectedAmount') {
      const value = fields[key]
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) result.add(key)
    } else if (key === 'waitDeposit' || key === 'isByContract') {
      if (typeof fields[key] === 'boolean') result.add(key)
    } else if (key === 'eventType' || key === 'description' || key === 'financeComment') {
      const value = fields[key]
      if (typeof value === 'string' && value.trim()) result.add(key)
    }
  }
  return result
}
