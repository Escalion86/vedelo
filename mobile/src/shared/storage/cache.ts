import { getDatabase } from './database'
import { assertLocalEntityIdentity, localEntityIdentity, resolveLocalEntityId } from './localEntityIds'
import { assertLocalDataEpoch, localDataEpoch, withLocalEntityWrite } from './localEntityCoordination'

export type CachedEntity<T extends object> = T & {
  _id: string
  syncVersion?: number
  updatedAt?: string
}

export const upsertEntities = async <T extends object>(
  entityType: string,
  entities: Array<CachedEntity<T>>
) => {
  if (entities.length === 0) return
  const database = await getDatabase()
  await database.withTransactionAsync(async () => {
    for (const entity of entities) {
      await database.runAsync(
        `INSERT INTO entity_cache (
          entity_type, entity_id, payload, version, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, NULL)
        ON CONFLICT(entity_type, entity_id) DO UPDATE SET
          payload = excluded.payload,
          version = excluded.version,
          updated_at = excluded.updated_at,
          deleted_at = NULL`,
        entityType,
        String(entity._id),
        JSON.stringify(entity),
        String(entity.syncVersion || 1),
        entity.updatedAt || new Date().toISOString()
      )
    }
  })
}

export const listCachedEntities = async <T extends object>(
  entityType: string
) => {
  const database = await getDatabase()
  const rows = await database.getAllAsync<{ payload: string }>(
    `SELECT payload FROM entity_cache
     WHERE entity_type = ? AND deleted_at IS NULL
     ORDER BY updated_at DESC`,
    entityType
  )
  return rows.map((row) => JSON.parse(row.payload) as CachedEntity<T>)
}

export const getCachedEntity = async <T extends object>(
  entityType: string,
  entityId: string
): Promise<CachedEntity<T> | null> => {
  const database = await getDatabase()
  const resolvedId = await resolveLocalEntityId(entityType, entityId)
  const row = await database.getFirstAsync<{ payload: string }>(
    `SELECT payload FROM entity_cache
     WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL`,
    entityType,
    resolvedId
  )
  // Remap may have finished while the local row was being read/deleted.
  const finalId = await resolveLocalEntityId(entityType, entityId)
  if (finalId !== resolvedId) return getCachedEntity<T>(entityType, finalId)
  return row ? (JSON.parse(row.payload) as CachedEntity<T>) : null
}

// A server readback owns one queue boundary, just like local save/remap/clear.
// Keep the public cache helpers reentrant; this boundary contains no network.
export const publishEntityReadback = async <T extends { syncStatus?: string }>(
  entityType: string,
  fresh: Record<string, unknown> & { _id: string },
  isActive: () => boolean,
  publish: (entity: CachedEntity<T>) => void
) => {
  const epoch = localDataEpoch()
  const identity = await localEntityIdentity()
  return withLocalEntityWrite(async () => {
    const live = () => {
      assertLocalDataEpoch(epoch)
      if (!isActive()) throw new Error('SESSION_CHANGED')
    }
    live()
    await assertLocalEntityIdentity(identity)
    const saved = await getCachedEntity<T>(entityType, fresh._id)
    const database = await getDatabase()
    const queued = await database.getFirstAsync<{ operation_id: string }>(
      `SELECT operation_id FROM outbox WHERE entity_type = ? AND entity_id = ?
       AND status IN ('pending', 'syncing', 'failed', 'conflict') LIMIT 1`,
      entityType,
      fresh._id
    )
    await assertLocalEntityIdentity(identity)
    live()
    if (!saved || saved._id !== fresh._id || queued ||
      (saved.syncStatus && saved.syncStatus !== 'synced'))
      throw new Error('EVENT_HAS_LOCAL_CHANGES')
    const changes = Object.fromEntries(Object.entries(fresh).filter(([, value]) => value !== undefined))
    const merged = { ...saved, ...changes } as CachedEntity<T>
    await upsertEntities(entityType, [merged])
    // A dispatched SQL write drains before clear. Publish synchronously while
    // still owning the queue so a later local save cannot precede this UI write.
    live()
    publish(merged)
    return merged
  })
}

export const removeCachedEntity = async (entityType: string, entityId: string) => {
  const database = await getDatabase()
  await database.runAsync(
    'DELETE FROM entity_cache WHERE entity_type = ? AND entity_id = ?',
    entityType,
    entityId
  )
}

export const applyTombstones = async (
  tombstones: Array<{ entityType: string; entityId: string; deletedAt: string }>
) => {
  if (tombstones.length === 0) return
  const database = await getDatabase()
  await database.withTransactionAsync(async () => {
    for (const tombstone of tombstones) {
      await database.runAsync(
        'DELETE FROM entity_cache WHERE entity_type = ? AND entity_id = ?',
        tombstone.entityType,
        tombstone.entityId
      )
    }
  })
}

export const getSyncCursor = async (scope = 'default') => {
  const database = await getDatabase()
  const row = await database.getFirstAsync<{ cursor: string }>(
    'SELECT cursor FROM sync_cursors WHERE scope = ?',
    scope
  )
  return row?.cursor || ''
}

export const setSyncCursor = async (cursor: string, scope = 'default') => {
  const database = await getDatabase()
  await database.runAsync(
    `INSERT INTO sync_cursors (scope, cursor, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`,
    scope,
    cursor,
    new Date().toISOString()
  )
}
