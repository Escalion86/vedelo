import mongoose from 'mongoose'
import Clients from '@models/Clients'
import Events from '@models/Events'
import {
  createPrivateFileAccessUrl,
  deletePrivateFileFromEscalionCloud,
  uploadPrivateFileToEscalionCloud,
} from '@server/escalionCloud'
import { normalizeEntityDocument } from '@helpers/entityDocuments'

export const ENTITY_DOCUMENT_MAX_SIZE = 5 * 1024 * 1024

const FILE_TYPES = new Map([
  ['pdf', new Set(['application/pdf'])],
  ['doc', new Set(['application/msword'])],
  [
    'docx',
    new Set([
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
  ],
  ['xls', new Set(['application/vnd.ms-excel'])],
  [
    'xlsx',
    new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]),
  ],
  ['csv', new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel'])],
  ['txt', new Set(['text/plain'])],
  ['jpg', new Set(['image/jpeg'])],
  ['jpeg', new Set(['image/jpeg'])],
  ['png', new Set(['image/png'])],
  ['webp', new Set(['image/webp'])],
])

const ENTITY_CONFIG = {
  events: {
    Model: Events,
    path: 'events',
    notFound: 'Заявка или заказ не найдены',
  },
  clients: { Model: Clients, path: 'clients', notFound: 'Клиент не найден' },
}

export class EntityDocumentError extends Error {
  constructor(code, message, status = 400, field = '') {
    super(message)
    this.name = 'EntityDocumentError'
    this.code = code
    this.status = status
    this.field = field
  }
}

export const sanitizeEntityFileName = (value) => {
  const name = String(value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 180)
  return name || 'file'
}

export const validateEntityDocumentFile = (
  file,
  isFile = (item) => typeof File !== 'undefined' && item instanceof File
) => {
  if (!isFile(file)) {
    throw new EntityDocumentError(
      'FILE_REQUIRED',
      'Передайте один файл',
      400,
      'file'
    )
  }
  const size = Number(file.size || 0)
  if (size <= 0) {
    throw new EntityDocumentError(
      'FILE_EMPTY',
      'Нельзя загрузить пустой файл',
      400,
      'file'
    )
  }
  if (size > ENTITY_DOCUMENT_MAX_SIZE) {
    throw new EntityDocumentError(
      'FILE_TOO_LARGE',
      'Файл не должен превышать 5 МБ',
      413,
      'file'
    )
  }
  const name = sanitizeEntityFileName(file.name)
  const extension = name.split('.').pop()?.toLowerCase() || ''
  const allowedMimeTypes = FILE_TYPES.get(extension)
  const contentType = String(file.type || '').toLowerCase()
  if (
    !allowedMimeTypes ||
    (contentType &&
      contentType !== 'application/octet-stream' &&
      !allowedMimeTypes.has(contentType))
  ) {
    throw new EntityDocumentError(
      'FILE_TYPE_NOT_ALLOWED',
      'Разрешены PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, JPEG, PNG и WebP',
      415,
      'file'
    )
  }
  return { file, name, contentType: contentType || 'application/octet-stream' }
}

export const normalizeEntityUploadId = (value) => {
  const uploadId = String(value || '').trim()
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(uploadId)) {
    throw new EntityDocumentError(
      'UPLOAD_ID_INVALID',
      'Некорректный идентификатор загрузки',
      400,
      'uploadId'
    )
  }
  return uploadId
}

export const buildEntityDocumentStorageKey = ({
  tenantId,
  entityType,
  entityId,
  uploadId,
}) => {
  const tenant = String(tenantId || '')
  const entity = String(entityId || '')
  const config = ENTITY_CONFIG[entityType]
  const normalizedUploadId = normalizeEntityUploadId(uploadId)
  if (
    !config ||
    !mongoose.Types.ObjectId.isValid(tenant) ||
    !mongoose.Types.ObjectId.isValid(entity)
  ) {
    throw new EntityDocumentError(
      'STORAGE_KEY_INVALID',
      'Не удалось сформировать безопасный ключ файла',
      400
    )
  }
  return `vedelo/${tenant}/${config.path}/${entity}/documents/${normalizedUploadId}`
}

const getEntity = async ({ entityType, entityId, tenantId }) => {
  const config = ENTITY_CONFIG[entityType]
  if (!config || !mongoose.Types.ObjectId.isValid(entityId)) {
    throw new EntityDocumentError(
      'ENTITY_ID_INVALID',
      'Некорректный ID',
      400,
      'id'
    )
  }
  const entity = await config.Model.findOne({ _id: entityId, tenantId }).lean()
  if (!entity) {
    throw new EntityDocumentError('ENTITY_NOT_FOUND', config.notFound, 404)
  }
  return { config, entity }
}

const ensureDocumentAccess = (access) => {
  if (!access?.allowDocuments) {
    throw new EntityDocumentError(
      'DOCUMENTS_UNAVAILABLE',
      'Файлы и документы недоступны на текущем тарифе',
      403
    )
  }
}

export const uploadEntityDocument = async ({
  formData,
  entityType,
  entityId,
  tenantId,
  access,
}) => {
  ensureDocumentAccess(access)
  const { config, entity } = await getEntity({ entityType, entityId, tenantId })
  const uploadId = normalizeEntityUploadId(
    formData?.get('uploadId') || formData?.get('fileQueueId')
  )
  const existing = (entity.documents || []).find(
    (item) => item?.id === uploadId
  )
  if (existing) return { document: existing, entity }

  const incomingFiles = [
    ...formData.getAll('file'),
    ...formData.getAll('files'),
  ]
  if (incomingFiles.length !== 1) {
    throw new EntityDocumentError(
      'FILE_REQUIRED',
      'Передайте один файл',
      400,
      'file'
    )
  }
  const validation = validateEntityDocumentFile(incomingFiles[0])
  const storageKey = buildEntityDocumentStorageKey({
    tenantId,
    entityType,
    entityId,
    uploadId,
  })
  const uploaded = await uploadPrivateFileToEscalionCloud({
    file: validation.file,
    storageKey,
    uploadId,
  })
  const document = normalizeEntityDocument(
    {
      id: uploadId,
      type: formData.get('type') || 'other',
      customTypeName: formData.get('customTypeName') || '',
      title: formData.get('title') || validation.name,
      file: {
        name: uploaded?.name || validation.name,
        storageKey: uploaded?.storageKey || storageKey,
        size: uploaded?.size || validation.file.size,
        contentType: uploaded?.contentType || validation.contentType,
        checksum: uploaded?.checksum || '',
      },
      createdAt: uploaded?.createdAt || new Date().toISOString(),
    },
    { trustStorageKey: true }
  )
  const updated = await config.Model.findOneAndUpdate(
    { _id: entityId, tenantId, 'documents.id': { $ne: uploadId } },
    { $push: { documents: document }, $inc: { syncVersion: 1 } },
    { returnDocument: 'after', runValidators: true }
  ).lean()
  const finalEntity =
    updated || (await config.Model.findOne({ _id: entityId, tenantId }).lean())
  const finalDocument =
    (finalEntity?.documents || []).find((item) => item?.id === uploadId) ||
    document
  return { document: finalDocument, entity: finalEntity }
}

export const getEntityDocumentAccess = async ({
  entityType,
  entityId,
  documentId,
  tenantId,
  access,
  disposition,
}) => {
  ensureDocumentAccess(access)
  const { entity } = await getEntity({ entityType, entityId, tenantId })
  const document = (entity.documents || []).find(
    (item) => item?.id === String(documentId || '')
  )
  if (!document) {
    throw new EntityDocumentError('FILE_NOT_FOUND', 'Документ не найден', 404)
  }
  const storageKey = String(document.file?.storageKey || '')
  const legacyUrl = String(document.url || document.file?.url || '')
  if (!storageKey) {
    if (!legacyUrl) {
      throw new EntityDocumentError(
        'FILE_NOT_FOUND',
        'У документа нет файла',
        404
      )
    }
    return { url: legacyUrl, expiresAt: null }
  }
  return createPrivateFileAccessUrl({
    storageKey,
    downloadName: sanitizeEntityFileName(document.file?.name || document.title),
    disposition: disposition === 'inline' ? 'inline' : 'attachment',
  })
}

export const deleteEntityDocument = async ({
  entityType,
  entityId,
  documentId,
  deleteId,
  tenantId,
  access,
}) => {
  ensureDocumentAccess(access)
  const { config, entity } = await getEntity({ entityType, entityId, tenantId })
  const normalizedDocumentId = String(documentId || '').trim()
  const document = (entity.documents || []).find(
    (item) => item?.id === normalizedDocumentId
  )
  if (!document) return { entity, deleted: false }
  const storageKey = String(document.file?.storageKey || '')
  if (storageKey) {
    await deletePrivateFileFromEscalionCloud({
      storageKey,
      deleteId: normalizeEntityUploadId(deleteId || normalizedDocumentId),
    })
  }
  const updated = await config.Model.findOneAndUpdate(
    { _id: entityId, tenantId },
    {
      $pull: { documents: { id: normalizedDocumentId } },
      $inc: { syncVersion: 1 },
    },
    { returnDocument: 'after' }
  ).lean()
  return { entity: updated, deleted: true }
}
