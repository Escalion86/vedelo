import type { Client, DocumentTemplate, Event } from '../../shared/domain/types'
import type { EncryptedLocalFile } from '../../shared/storage/encryptedFiles'

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const documentTypes: Array<[DocumentTemplate['type'], string]> = [
  ['contract', 'Договор'], ['invoice', 'Счёт'], ['receipt', 'Чек'], ['act', 'Акт'], ['other', 'Другое'],
]
export type DocumentEntity = (Client | Event) & { documentFiles?: Event['documentFiles'] }
export type EntityKind = 'events' | 'clients'
export type DocumentRow = NonNullable<Event['documents']>[number] & { legacyUrl?: string }
export type PickedFile = { uri: string; name: string; mimeType?: string | null; size?: number | null }

export const typeLabel = (type: DocumentTemplate['type'], custom = '') =>
  (type === 'other' && custom.trim()) || documentTypes.find(([value]) => value === type)?.[1] || 'Документ'
export const fileSize = (size?: number | null) => size ? `${Math.max(1, Math.ceil(size / 1024))} КБ` : ''
export const phaseLabel = (status: string) => ({ pending: 'Ожидает отправки', uploading: 'Отправляется', failed: 'Ошибка отправки', synced: 'Синхронизирован' }[status] || 'Состояние неизвестно')
export const phaseTone = (status: string) => status === 'synced' ? 'success' as const : status === 'failed' ? 'danger' as const : 'warning' as const
export const safeDocumentError = (cause: unknown, fallback: string) => {
  const status = (cause as { status?: number } | null)?.status
  if (status === 403) return 'Нет доступа к документу или функция недоступна на текущем тарифе.'
  if (status === 404) return 'Документ или связанная запись не найдены. Повторите чтение.'
  return fallback
}
export const validatePickedFile = (file: PickedFile | undefined, docx = false) => {
  if (!file?.uri || !file.name) return 'Выберите файл'
  if (docx && !file.name.toLowerCase().endsWith('.docx') && file.mimeType !== DOCX_MIME) return 'Выберите файл в формате DOCX'
  if (Number(file.size || 0) > MAX_FILE_BYTES) return docx ? 'Размер DOCX-шаблона не должен превышать 5 МБ' : 'Размер файла не должен превышать 5 МБ'
  return ''
}
export const validDocumentDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export const isServerEntityId = (id: string) => /^[a-f\d]{24}$/i.test(id)
export const requireEntity = (entity: DocumentEntity | null | undefined, id: string): DocumentEntity => {
  if (!id || entity?._id !== id) throw new Error('ENTITY_MISMATCH')
  if (entity.documents !== undefined && (!Array.isArray(entity.documents) || entity.documents.some((document) => typeof document?.id !== 'string' || !document.id.trim()))) throw new Error('INVALID_DOCUMENTS')
  return entity
}
export const readEntityResponse = (response: { success?: boolean; data?: DocumentEntity }, id: string) => {
  if (response?.success !== true || !response.data || (response.data.documents !== undefined && (!Array.isArray(response.data.documents) || response.data.documents.some((document) => typeof document?.id !== 'string' || !document.id)))) throw new Error('INVALID_RESPONSE')
  return requireEntity(response.data, id)
}
export const readTemplatesResponse = (response: { success?: boolean; data?: DocumentTemplate[] }) => {
  if (response?.success !== true || !Array.isArray(response.data) || response.data.some((item) => typeof item?.id !== 'string' || !item.id.trim() || typeof item.name !== 'string' || typeof item.fileName !== 'string' || !documentTypes.some(([type]) => type === item.type)) || new Set(response.data.map((item) => item.id)).size !== response.data.length) throw new Error('INVALID_RESPONSE')
  return response.data
}
// Отображение legacy без миграции и без случайных новых ID при каждом чтении.
export const documentRows = (entity: DocumentEntity): DocumentRow[] => {
  const documents = entity.documents || []
  const urls = new Set(documents.flatMap((item) => [item.url, item.file?.url].filter(Boolean)))
  const ids = new Set(documents.map((item) => item.id))
  const legacy = (entity.documentFiles || []).filter((item) => item.url && !urls.has(item.url) && (!item.mobileUploadId || !ids.has(item.mobileUploadId)))
  return [...documents, ...legacy.map((item) => ({ id: `legacy:${item.url}`, legacyUrl: item.url, type: 'other' as const, title: item.description || item.name || 'Вложение', file: { name: item.name, url: item.url, size: item.size, contentType: item.type } }))]
}
export const requireDocument = (entity: DocumentEntity, row: DocumentRow) => {
  if (typeof row.id !== 'string' || !row.id.trim()) throw new Error('DOCUMENT_MISMATCH')
  const current = documentRows(entity).find((item) => item.id === row.id && item.legacyUrl === row.legacyUrl)
  if (!current) throw new Error('DOCUMENT_MISMATCH')
  return current
}
export const requireLocalFile = (files: EncryptedLocalFile[], file: EncryptedLocalFile, kind?: EntityKind, id?: string) => {
  const current = files.find((item) => item.id === file.id)
  if (!current || !current.id || !current.localUri || current.localUri !== file.localUri || current.entityType !== file.entityType || current.entityId !== file.entityId || (kind && (current.entityType !== kind || current.entityId !== id))) throw new Error('FILE_MISMATCH')
  return current
}
export const removeDocumentPatch = (entity: DocumentEntity, row: DocumentRow) => {
  const current = requireDocument(entity, row)
  const urls = [current.url, current.file?.url, current.legacyUrl].filter(Boolean)
  return {
    documents: (entity.documents || []).filter((item) => item.id !== current.id),
    ...(entity.documentFiles ? { documentFiles: entity.documentFiles.filter((item) => !urls.includes(item.url) && item.mobileUploadId !== current.id) } : {}),
  }
}
export const safeDocumentUrl = (url: unknown) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('INVALID_URL')
  const parsed = new URL(url)
  if (parsed.username || parsed.password) throw new Error('INVALID_URL')
  return url
}
