import type { EventDraft } from '../../shared/domain/eventForm'
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
