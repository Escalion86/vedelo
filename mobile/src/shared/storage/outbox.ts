import * as Crypto from 'expo-crypto'
import { replaceLocalReference } from '../domain/localReferences'
import { markSyncPending, refreshSyncStateFromQueue } from '../sync/syncState'
import { getDatabase } from './database'

export type OutboxMethod = 'create' | 'update' | 'delete'
export type OutboxStatus =
  | 'pending'
  | 'syncing'
  | 'failed'
  | 'conflict'
  | 'synced'

export type OutboxOperation = {
  operationId: string
  entityType: string
  entityId: string
  method: OutboxMethod
  payload: Record<string, unknown>
  baseVersion?: string | null
  baseValues?: Record<string, unknown> | null
  attachments?: Array<Record<string, unknown>>
  status: OutboxStatus
  attempts: number
  nextRetryAt?: string | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

export type OutboxDisplayItem = Pick<
  OutboxOperation,
  | 'operationId'
  | 'entityType'
  | 'entityId'
  | 'method'
  | 'status'
  | 'attempts'
  | 'nextRetryAt'
  | 'lastError'
  | 'updatedAt'
>

const mapOperation = (row: Record<string, unknown>): OutboxOperation => ({
  operationId: String(row.operation_id),
  entityType: String(row.entity_type),
  entityId: String(row.entity_id),
  method: row.method as OutboxMethod,
  payload: JSON.parse(String(row.payload || '{}')),
  baseVersion: row.base_version ? String(row.base_version) : null,
  baseValues: row.base_values ? JSON.parse(String(row.base_values)) : null,
  attachments: row.attachments ? JSON.parse(String(row.attachments)) : [],
  status: row.status as OutboxStatus,
  attempts: Number(row.attempts || 0),
  nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : null,
  lastError: row.last_error ? String(row.last_error) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
})

export const getOutboxOperation = async (operationId: string) => {
  const database = await getDatabase()
  const row = await database.getFirstAsync<Record<string, unknown>>('SELECT * FROM outbox WHERE operation_id = ?', operationId)
  return row ? mapOperation(row) : null
}

export const enqueueOperation = async (
  operation: Omit<
    OutboxOperation,
    'operationId' | 'status' | 'attempts' | 'createdAt' | 'updatedAt'
  >,
  stableOperationId?: string,
  notifyPending = true,
) => {
  const database = await getDatabase()
  const now = new Date().toISOString()
  const operationId = stableOperationId || Crypto.randomUUID()
  await database.runAsync(
    `INSERT INTO outbox (
      operation_id, entity_type, entity_id, method, payload, base_version,
      base_values, attachments, status, attempts, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    operationId,
    operation.entityType,
    operation.entityId,
    operation.method,
    JSON.stringify(operation.payload || {}),
    operation.baseVersion || null,
    operation.baseValues ? JSON.stringify(operation.baseValues) : null,
    JSON.stringify(operation.attachments || []),
    now,
    now
  )
  if (notifyPending) await markSyncPending()
  return operationId
}

export const listPendingOperations = async (limit = 50) => {
  const database = await getDatabase()
  const rows = await database.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM outbox
     WHERE status IN ('pending', 'failed')
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY created_at ASC, rowid ASC
     LIMIT ?`,
    new Date().toISOString(),
    limit
  )
  return rows.map(mapOperation)
}

export const getOutboxSummary = async () => {
  const database = await getDatabase()
  const rows = await database.getAllAsync<{
    status: OutboxStatus
    count: number
  }>('SELECT status, COUNT(*) as count FROM outbox GROUP BY status')
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]))
}

export const listOutboxDisplayItems = async (
  limit = 25
): Promise<OutboxDisplayItem[]> => {
  const database = await getDatabase()
  const rows = await database.getAllAsync<Record<string, unknown>>(
    `SELECT operation_id, entity_type, entity_id, method, status, attempts,
      next_retry_at, last_error, updated_at
     FROM outbox
     WHERE status IN ('pending', 'syncing', 'failed', 'conflict')
     ORDER BY CASE status
       WHEN 'conflict' THEN 0
       WHEN 'failed' THEN 1
       WHEN 'syncing' THEN 2
       ELSE 3
     END, updated_at DESC
     LIMIT ?`,
    Math.max(1, Math.min(100, Math.trunc(limit)))
  )
  return rows.map((row) => ({
    operationId: String(row.operation_id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    method: row.method as OutboxMethod,
    status: row.status as OutboxStatus,
    attempts: Number(row.attempts || 0),
    nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    updatedAt: String(row.updated_at),
  }))
}

export const retryOutboxOperationNow = async (operationId: string) => {
  const database = await getDatabase()
  const result = await database.runAsync(
    `UPDATE outbox SET status = 'pending', attempts = 0,
      next_retry_at = NULL, last_error = NULL, updated_at = ?
     WHERE operation_id = ? AND status = 'failed'`,
    new Date().toISOString(),
    operationId
  )
  if (result.changes > 0) await markSyncPending()
  return result.changes > 0
}

export const updateOperationStatus = async (
  operationId: string,
  status: OutboxStatus,
  options: {
    attempts?: number
    nextRetryAt?: string | null
    lastError?: string | null
  } = {}
) => {
  const database = await getDatabase()
  await database.runAsync(
    `UPDATE outbox SET status = ?, attempts = COALESCE(?, attempts),
      next_retry_at = ?, last_error = ?, updated_at = ? WHERE operation_id = ?`,
    status,
    options.attempts ?? null,
    options.nextRetryAt ?? null,
    options.lastError ?? null,
    new Date().toISOString(),
    operationId
  )
}

export const mergePendingLocalCreate = async (
  entityType: string,
  entityId: string,
  values: Record<string, unknown>
) => {
  const database = await getDatabase()
  const row = await database.getFirstAsync<{
    operation_id: string
    payload: string
  }>(
    `SELECT operation_id, payload FROM outbox
     WHERE entity_type = ? AND entity_id = ? AND method = 'create'
       AND status IN ('pending', 'failed')
     ORDER BY created_at ASC, rowid ASC LIMIT 1`,
    entityType,
    entityId
  )
  if (!row) return false
  const payload = { ...JSON.parse(row.payload || '{}'), ...values }
  await database.runAsync(
    `UPDATE outbox SET payload = ?, status = 'pending', attempts = 0,
      next_retry_at = NULL, last_error = NULL, updated_at = ?
     WHERE operation_id = ?`,
    JSON.stringify(payload),
    new Date().toISOString(),
    row.operation_id
  )
  await markSyncPending()
  return true
}

export const discardEntityOperations = async (
  entityType: string,
  entityId: string
) => {
  const database = await getDatabase()
  await database.runAsync(
    `DELETE FROM outbox WHERE entity_type = ? AND entity_id = ?
      AND status IN ('pending', 'failed', 'conflict')`,
    entityType,
    entityId
  )
  await refreshSyncStateFromQueue()
}

export const replacePendingEntityId = async (
  entityType: string,
  localEntityId: string,
  serverEntityId: string
) => {
  const database = await getDatabase()
  await database.runAsync(
    `UPDATE outbox SET entity_id = ?, status = 'pending', attempts = 0,
     next_retry_at = NULL, last_error = NULL, updated_at = ?
     WHERE entity_type = ? AND entity_id = ? AND status IN ('pending', 'failed')`,
    serverEntityId,
    new Date().toISOString(),
    entityType,
    localEntityId
  )
}

export const replacePendingLocalReferences = async (
  localEntityId: string,
  serverEntityId: string
) => {
  const database = await getDatabase()
  const now = new Date().toISOString()
  const operations = await database.getAllAsync<{
    operation_id: string
    payload: string
    base_values: string | null
    attachments: string | null
  }>(
    `SELECT operation_id, payload, base_values, attachments FROM outbox
     WHERE status IN ('pending', 'failed')`
  )
  const cachedEntities = await database.getAllAsync<{
    entity_type: string
    entity_id: string
    payload: string
  }>(
    'SELECT entity_type, entity_id, payload FROM entity_cache WHERE deleted_at IS NULL'
  )

  await database.withTransactionAsync(async () => {
    for (const operation of operations) {
      const payload = replaceLocalReference(
        JSON.parse(operation.payload || '{}'),
        localEntityId,
        serverEntityId
      )
      const baseValues = operation.base_values
        ? replaceLocalReference(
            JSON.parse(operation.base_values),
            localEntityId,
            serverEntityId
          )
        : null
      const attachments = operation.attachments
        ? replaceLocalReference(
            JSON.parse(operation.attachments),
            localEntityId,
            serverEntityId
          )
        : []
      const payloadJson = JSON.stringify(payload)
      const baseValuesJson = baseValues ? JSON.stringify(baseValues) : null
      const attachmentsJson = JSON.stringify(attachments)
      if (
        payloadJson === operation.payload &&
        baseValuesJson === operation.base_values &&
        attachmentsJson === (operation.attachments || '[]')
      )
        continue
      await database.runAsync(
        `UPDATE outbox SET payload = ?, base_values = ?, attachments = ?,
         status = 'pending', attempts = 0, next_retry_at = NULL,
         last_error = NULL, updated_at = ? WHERE operation_id = ?`,
        payloadJson,
        baseValuesJson,
        attachmentsJson,
        now,
        operation.operation_id
      )
    }
    for (const entity of cachedEntities) {
      const payload = replaceLocalReference(
        JSON.parse(entity.payload),
        localEntityId,
        serverEntityId
      )
      const payloadJson = JSON.stringify(payload)
      if (payloadJson === entity.payload) continue
      await database.runAsync(
        `UPDATE entity_cache SET payload = ?, updated_at = ?
         WHERE entity_type = ? AND entity_id = ?`,
        payloadJson,
        now,
        entity.entity_type,
        entity.entity_id
      )
    }
    await database.runAsync(
      `UPDATE file_queue SET entity_id = ?, updated_at = ?
       WHERE entity_id = ?`,
      serverEntityId,
      now,
      localEntityId
    )
  })
}
