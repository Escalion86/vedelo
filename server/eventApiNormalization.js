import {
  eventHasDocuments,
  normalizeEventDocuments,
} from '../helpers/eventDocuments.js'
import { additionalGoogleFields } from '../helpers/googleTasksBeta.mjs'

const hasDocuments = (payload) => eventHasDocuments(payload)

const parseDateValue = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const normalizeWaitDeposit = (value) => Boolean(value)

const normalizeEventType = (value) =>
  typeof value === 'string' ? value.trim() : ''

const normalizeDepositExpectedAmount = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return null
  return Math.floor(number)
}

const normalizeAdditionalEvents = (items, options = null) => {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const description =
        typeof item.description === 'string' ? item.description.trim() : ''
      const date = parseDateValue(item.date)
      if (!title && !description && !date) return null
      const googleCalendarEventId =
        typeof item.googleCalendarEventId === 'string'
          ? item.googleCalendarEventId.trim()
          : ''
      const done = Boolean(item.done)
      const doneAt = done ? parseDateValue(item.doneAt) : null
      return {
        title,
        description,
        date,
        done,
        doneAt,
        googleCalendarEventId,
        ...(options ? additionalGoogleFields(item, options.previous || [], options.user) : {}),
      }
    })
    .filter(Boolean)
}

const normalizeEventDocumentFiles = (items) => {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const url = typeof item.url === 'string' ? item.url.trim() : ''
      if (!url) return null
      const name =
        typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : url.split('/').pop() || 'Документ'
      const description =
        typeof item.description === 'string' ? item.description.trim() : ''
      const size = Number(item.size)
      const uploadedAt = parseDateValue(item.uploadedAt) ?? new Date()
      const mobileUploadId =
        typeof item.mobileUploadId === 'string'
          ? item.mobileUploadId.trim().slice(0, 80)
          : ''
      return {
        ...(mobileUploadId ? { mobileUploadId } : {}),
        name,
        description,
        url,
        size: Number.isFinite(size) && size >= 0 ? Math.floor(size) : 0,
        type: typeof item.type === 'string' ? item.type.trim() : '',
        uploadedAt: uploadedAt.toISOString(),
      }
    })
    .filter(Boolean)
}

export {
  hasDocuments,
  parseDateValue,
  normalizeWaitDeposit,
  normalizeEventType,
  normalizeDepositExpectedAmount,
  normalizeAdditionalEvents,
  normalizeEventDocumentFiles,
  normalizeEventDocuments,
}
