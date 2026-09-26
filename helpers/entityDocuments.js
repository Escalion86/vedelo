import {
  DOCUMENT_TYPES,
  getDocumentDefaultTitle,
  normalizeDocumentType,
} from './documentTypes.js'
import { normalizeDocumentMetadata } from './documentWorkflow.js'

const cleanString = (value) => String(value ?? '').trim()

const createDocumentId = () => {
  if (typeof crypto !== 'undefined' && crypto?.randomUUID) {
    return crypto.randomUUID()
  }
  return `document-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const normalizeIsoDate = (value, fallback) => {
  const raw = cleanString(value)
  if (!raw) return fallback
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

const normalizeDocumentFile = (
  file,
  { allowedStorageKeys = null, trustStorageKey = false } = {}
) => {
  if (!file || typeof file !== 'object') return null
  const name = cleanString(file.name || file.fileName || file.description)
  const url = cleanString(file.url)
  const path = cleanString(file.path || file.filePath)
  const requestedStorageKey = cleanString(file.storageKey)
  const storageKey =
    trustStorageKey || allowedStorageKeys?.has(requestedStorageKey)
      ? requestedStorageKey
      : ''
  if (!url && !path && !storageKey) return null
  return {
    name: name || 'Документ',
    storageKey,
    url,
    path,
    size: Number(file.size) > 0 ? Number(file.size) : null,
    contentType: cleanString(file.contentType || file.type),
    checksum: cleanString(file.checksum),
  }
}

const normalizeEntityDocument = (
  document,
  { now = new Date().toISOString(), ...options } = {}
) => {
  if (!document || typeof document !== 'object') return null
  const type = normalizeDocumentType(document.type)
  const customTypeName =
    type === DOCUMENT_TYPES.OTHER ? cleanString(document.customTypeName) : ''
  const url = cleanString(document.url)
  const file = normalizeDocumentFile(document.file, options)
  if (!url && !file) return null
  return {
    id: cleanString(document.id) || createDocumentId(),
    type,
    customTypeName,
    title:
      cleanString(document.title) ||
      getDocumentDefaultTitle(type, customTypeName),
    url,
    file,
    createdAt: normalizeIsoDate(document.createdAt, now),
    ...normalizeDocumentMetadata(document),
  }
}

const getDocumentDedupKey = (document) => {
  if (!document) return ''
  if (document.id) return `id:${document.id}`
  if (document.file?.storageKey) return `storage:${document.file.storageKey}`
  if (document.file?.path) return `path:${document.file.path}`
  if (document.url) return `url:${document.url}`
  if (document.file?.url) return `file-url:${document.file.url}`
  if (document.file?.name && document.file?.size) {
    return `file:${document.file.name}:${document.file.size}`
  }
  return ''
}

const getDocumentDedupKeys = (document) =>
  [
    document?.id ? `id:${document.id}` : '',
    document?.file?.storageKey ? `storage:${document.file.storageKey}` : '',
    document?.file?.path ? `path:${document.file.path}` : '',
    document?.url ? `url:${document.url}` : '',
    document?.file?.url ? `url:${document.file.url}` : '',
    document?.file?.name && document?.file?.size
      ? `file:${document.file.name}:${document.file.size}`
      : '',
  ].filter(Boolean)

const normalizeEntityDocuments = (documents, options = {}) => {
  if (!Array.isArray(documents)) return []
  const seen = new Set()
  return documents
    .map((document) => normalizeEntityDocument(document, options))
    .filter(Boolean)
    .filter((document) => {
      const keys = getDocumentDedupKeys(document)
      if (keys.some((key) => seen.has(key))) return false
      keys.forEach((key) => seen.add(key))
      return true
    })
}

const getDocumentStorageKeys = (documents) =>
  new Set(
    (Array.isArray(documents) ? documents : [])
      .map((document) => cleanString(document?.file?.storageKey))
      .filter(Boolean)
  )

const linkDocuments = (links, type, title, now) =>
  (Array.isArray(links) ? links : [])
    .map((url) => cleanString(url))
    .filter(Boolean)
    .map((url) => ({ type, title, url, createdAt: now }))

const legacyFileDocuments = (files, now) =>
  (Array.isArray(files) ? files : []).map((file) => ({
    id: cleanString(file?.mobileUploadId),
    type: DOCUMENT_TYPES.OTHER,
    title: cleanString(file?.description || file?.name) || 'Документ',
    file: {
      name: file?.name,
      url: file?.url,
      size: file?.size,
      contentType: file?.type,
    },
    createdAt: file?.uploadedAt || now,
  }))

const mergeLegacyEventDocuments = (
  event,
  { now = new Date().toISOString() } = {}
) =>
  normalizeEntityDocuments(
    [
      ...(Array.isArray(event?.documents) ? event.documents : []),
      ...linkDocuments(
        event?.contractLinks,
        DOCUMENT_TYPES.CONTRACT,
        'Договор',
        now
      ),
      ...linkDocuments(
        event?.invoiceLinks,
        DOCUMENT_TYPES.INVOICE,
        'Счет',
        now
      ),
      ...linkDocuments(event?.receiptLinks, DOCUMENT_TYPES.RECEIPT, 'Чек', now),
      ...linkDocuments(event?.actLinks, DOCUMENT_TYPES.ACT, 'Акт', now),
      ...legacyFileDocuments(event?.documentFiles, now),
    ],
    { now, trustStorageKey: true }
  )

const entityHasDocuments = (payload) =>
  normalizeEntityDocuments(payload?.documents, { trustStorageKey: true })
    .length > 0

export {
  entityHasDocuments,
  getDocumentDedupKey,
  getDocumentStorageKeys,
  mergeLegacyEventDocuments,
  normalizeDocumentFile,
  normalizeEntityDocument,
  normalizeEntityDocuments,
}
