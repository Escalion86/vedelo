import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import { Directory, File, Paths } from 'expo-file-system'
import { getDatabase } from './database'
import { api } from '../api/client'
import { upsertEntities } from './cache'
import { markSyncPending, refreshSyncStateFromQueue } from '../sync/syncState'
import {
  extractRemoteFileUrl,
  FILE_QUEUE_MAX_ATTEMPTS,
  processFileQueueItems,
  type FileQueueItem,
  validateLocalFileSize,
} from './fileQueueProcessor'

const FILE_KEY = 'artistcrm_file_encryption_key'
const UPLOAD_TEMP_PREFIX = 'artistcrm-upload-'
const SHARE_TEMP_PREFIX = 'artistcrm-share-'
const encryptedDirectory = new Directory(Paths.document, 'encrypted-files')

const getKey = async () => {
  const stored = await SecureStore.getItemAsync(FILE_KEY)
  if (stored) return Crypto.AESEncryptionKey.import(stored, 'base64')
  const key = await Crypto.AESEncryptionKey.generate(Crypto.AESKeySize.AES256)
  await SecureStore.setItemAsync(FILE_KEY, await key.encoded('base64'), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
  return key
}

export type EncryptedLocalFile = {
  id: string
  localUri: string
  name: string
  mimeType: string
  size: number
  status: string
  remoteUrl?: string
  lastError?: string
  entityType?: string
  entityId?: string
  attachmentKind?: string
}

export type FileQueueDisplayItem = {
  id: string
  name: string
  status: string
  attempts: number
  lastError?: string
  entityType?: string
  entityId?: string
  updatedAt: string
}

const removeTemporaryFile = async (uri: string) => {
  const temporaryFile = new File(uri)
  if (temporaryFile.exists) temporaryFile.delete()
}

export const cleanupStaleDecryptedTemporaryFiles = async () => {
  try {
    const cache = new Directory(Paths.cache)
    if (!cache.exists) return
    for (const entry of cache.list()) {
      if (
        entry instanceof File &&
        (entry.name.startsWith(UPLOAD_TEMP_PREFIX) ||
          entry.name.startsWith(SHARE_TEMP_PREFIX))
      ) {
        if (entry.exists) entry.delete()
      }
    }
  } catch {
    // Cleanup after process death is best-effort; encrypted sources remain intact.
  }
}

export const encryptAndQueueFile = async ({
  uri,
  name,
  mimeType,
  size,
  entityType,
  entityId,
  attachmentKind,
}: {
  uri: string
  name: string
  mimeType?: string | null
  size?: number | null
  entityType?: string
  entityId?: string
  attachmentKind?: string
}) => {
  const source = new File(uri)
  const actualSize = validateLocalFileSize(Number(size || source.size || 0))
  encryptedDirectory.create({ idempotent: true, intermediates: true })
  const id = Crypto.randomUUID()
  const key = await getKey()
  const sealed = await Crypto.aesEncryptAsync(await source.bytes(), key)
  const destination = new File(encryptedDirectory, `${id}.acrm`)
  destination.create({ overwrite: true, intermediates: true })
  destination.write(await sealed.combined())
  const now = new Date().toISOString()
  const database = await getDatabase()
  await database.runAsync(
    `INSERT INTO file_queue (
      id, operation_id, local_uri, display_name, remote_path, mime_type, size,
      entity_type, entity_id, attachment_kind, status, attempts, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    id,
    '',
    destination.uri,
    name,
    mimeType || 'application/octet-stream',
    actualSize,
    entityType || null,
    entityId || null,
    attachmentKind || null,
    now,
    now
  )
  await markSyncPending()
  return {
    id,
    localUri: destination.uri,
    name,
    mimeType: mimeType || '',
    size: actualSize,
    status: 'pending',
    entityType: entityType || undefined,
    entityId: entityId || undefined,
    attachmentKind: attachmentKind || undefined,
  }
}

export const listEncryptedFiles = async (filter?: {
  entityType?: string
  entityId?: string
}) => {
  const database = await getDatabase()
  const conditions: string[] = []
  const params: string[] = []
  if (filter?.entityType) {
    conditions.push('entity_type = ?')
    params.push(filter.entityType)
  }
  if (filter?.entityId) {
    conditions.push('entity_id = ?')
    params.push(filter.entityId)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = await database.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM file_queue ${where} ORDER BY created_at DESC`,
    ...params
  )
  return rows.map(
    (row): EncryptedLocalFile => ({
      id: String(row.id),
      localUri: String(row.local_uri),
      name: String(row.display_name || row.remote_path || 'Файл'),
      mimeType: String(row.mime_type || ''),
      size: Number(row.size || 0),
      status: String(row.status || 'pending'),
      remoteUrl: row.display_name ? String(row.remote_path || '') : undefined,
      lastError: String(row.last_error || ''),
      entityType: row.entity_type ? String(row.entity_type) : undefined,
      entityId: row.entity_id ? String(row.entity_id) : undefined,
      attachmentKind: row.attachment_kind
        ? String(row.attachment_kind)
        : undefined,
    })
  )
}

export const listFileQueueDisplayItems = async (
  limit = 25
): Promise<FileQueueDisplayItem[]> => {
  const database = await getDatabase()
  const rows = await database.getAllAsync<Record<string, unknown>>(
    `SELECT id, display_name, status, attempts, last_error,
      entity_type, entity_id, updated_at
     FROM file_queue
     WHERE status IN ('pending', 'uploading', 'failed')
     ORDER BY CASE status
       WHEN 'failed' THEN 0
       WHEN 'uploading' THEN 1
       ELSE 2
     END, updated_at DESC
     LIMIT ?`,
    Math.max(1, Math.min(100, Math.trunc(limit)))
  )
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.display_name || 'Файл'),
    status: String(row.status || 'pending'),
    attempts: Number(row.attempts || 0),
    lastError: row.last_error ? String(row.last_error) : undefined,
    entityType: row.entity_type ? String(row.entity_type) : undefined,
    entityId: row.entity_id ? String(row.entity_id) : undefined,
    updatedAt: String(row.updated_at),
  }))
}

export const deleteEncryptedFile = async (id: string) => {
  const database = await getDatabase()
  const row = await database.getFirstAsync<{ local_uri: string }>(
    'SELECT local_uri FROM file_queue WHERE id = ?',
    id
  )
  await database.runAsync('DELETE FROM file_queue WHERE id = ?', id)
  await refreshSyncStateFromQueue()
  if (!row?.local_uri) return
  try {
    const file = new File(row.local_uri)
    if (file.exists) file.delete()
  } catch {
    // The queue row is gone; an orphaned encrypted blob contains no plaintext.
  }
}

export const decryptToTemporaryFile = async (
  item: EncryptedLocalFile,
  purpose: 'share' | 'upload' = 'share'
) => {
  const source = new File(item.localUri)
  if (!source.exists) {
    throw new Error(
      'Локальный зашифрованный файл не найден. Добавьте вложение повторно'
    )
  }
  const key = await getKey()
  const sealed = Crypto.AESSealedData.fromCombined(await source.bytes())
  const decrypted = await Crypto.aesDecryptAsync(sealed, key)
  const safeName = item.name.replace(/[\\/:*?"<>|]/g, '_')
  const prefix = purpose === 'upload' ? UPLOAD_TEMP_PREFIX : SHARE_TEMP_PREFIX
  const destination = new File(Paths.cache, `${prefix}${item.id}-${safeName}`)
  destination.create({ overwrite: true, intermediates: true })
  destination.write(decrypted)
  return destination.uri
}

export const deleteTemporaryDecryptedFile = removeTemporaryFile

export const syncFileQueue = async () => {
  await cleanupStaleDecryptedTemporaryFiles()
  const database = await getDatabase()
  const rows = await database.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM file_queue
     WHERE status IN ('pending', 'failed') AND attempts < ?
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY created_at ASC LIMIT 5`,
    FILE_QUEUE_MAX_ATTEMPTS,
    new Date().toISOString()
  )
  const items: FileQueueItem[] = rows.map((row) => ({
    id: String(row.id),
    localUri: String(row.local_uri),
    name: String(row.display_name || row.remote_path || 'Файл'),
    mimeType: String(row.mime_type || ''),
    size: Number(row.size || 0),
    status: String(row.status),
    attempts: Number(row.attempts || 0),
    remoteUrl: String(row.remote_path || ''),
    entityType: row.entity_type ? String(row.entity_type) : undefined,
    entityId: row.entity_id ? String(row.entity_id) : undefined,
    attachmentKind: row.attachment_kind
      ? String(row.attachment_kind)
      : undefined,
  }))

  await processFileQueueItems(items, {
    markUploading: async (item, updatedAt) => {
      await database.runAsync(
        "UPDATE file_queue SET status = 'uploading', last_error = NULL, updated_at = ? WHERE id = ?",
        updatedAt,
        item.id
      )
    },
    decrypt: (item) => decryptToTemporaryFile(item, 'upload'),
    upload: async (item, temporaryUri) => {
      if (item.remoteUrl) return item.remoteUrl
      const form = new FormData()
      form.append('files', {
        uri: temporaryUri,
        name: item.name,
        type: item.mimeType || 'application/octet-stream',
      } as unknown as Blob)
      const isEntityDocument =
        ['events', 'clients'].includes(item.entityType || '') &&
        item.entityId &&
        ['documentFile', 'entityDocument'].includes(item.attachmentKind || '')
      if (isEntityDocument) {
        form.append('fileQueueId', item.id)
        form.append('type', 'other')
        form.append('title', item.name)
      }
      const response = await api.upload<{
        success: true
        data: { document?: { id?: string }; entity?: { _id: string } }
      }>(
        isEntityDocument
          ? `/mobile/v1/${item.entityType}/${encodeURIComponent(item.entityId || '')}/files`
          : '/mobile/v1/files',
        form
      )
      if (isEntityDocument && response.data.entity?._id) {
        await upsertEntities(item.entityType || '', [response.data.entity])
      }
      return extractRemoteFileUrl(response.data)
    },
    markSynced: async (item, remoteUrl, updatedAt) => {
      await database.runAsync(
        "UPDATE file_queue SET status = 'synced', remote_path = ?, next_retry_at = NULL, updated_at = ?, last_error = NULL WHERE id = ?",
        remoteUrl,
        updatedAt,
        item.id
      )
    },
    markFailed: async (item, failure) => {
      await database.runAsync(
        `UPDATE file_queue SET status = 'failed', attempts = ?,
         next_retry_at = ?, last_error = ?, updated_at = ? WHERE id = ?`,
        failure.attempts,
        failure.nextRetryAt,
        failure.error,
        failure.updatedAt,
        item.id
      )
    },
    cleanup: removeTemporaryFile,
  })
}

export const retryFileQueueNow = async (filter?: {
  id?: string
  entityType?: string
  entityId?: string
}) => {
  const database = await getDatabase()
  const conditions = ["status = 'failed'"]
  const params: string[] = []
  if (filter?.id) {
    conditions.push('id = ?')
    params.push(filter.id)
  }
  if (filter?.entityType) {
    conditions.push('entity_type = ?')
    params.push(filter.entityType)
  }
  if (filter?.entityId) {
    conditions.push('entity_id = ?')
    params.push(filter.entityId)
  }
  const result = await database.runAsync(
    `UPDATE file_queue SET status = 'pending', attempts = 0,
      next_retry_at = NULL, last_error = NULL, updated_at = ?
     WHERE ${conditions.join(' AND ')}`,
    new Date().toISOString(),
    ...params
  )
  if (result.changes > 0) await markSyncPending()
  return result.changes
}
