import { getStoredUser, subscribeAuthSession } from '../auth/tokenStore'
import { getDatabase } from './database'
import { assertLocalDataEpoch, invalidateLocalDataEpoch, localDataEpoch } from './localEntityCoordination'

// Internal cache rows: never pulled, projected as events, or sent in outbox DTOs.
const prefix = '__local_id_map:'
const identityOf = (user: { _id: string; tenantId?: string } | null) =>
  user ? JSON.stringify([user._id, user.tenantId || user._id]) : ''
export const localEntityIdentity = async () => {
  subscribeIdentity()
  const epoch = localDataEpoch()
  const current = identityOf(await getStoredUser())
  assertLocalDataEpoch(epoch)
  identity = current
  return current
}
export const assertLocalEntityIdentity = async (expected: string) => {
  if (!expected || await localEntityIdentity() !== expected) throw new Error('SESSION_CHANGED')
}
let identity = ''
let subscribed = false
let cleanup: Promise<unknown> = Promise.resolve()
const subscribeIdentity = () => {
  if (!subscribed) {
    subscribed = true
    subscribeAuthSession((user) => {
      const next = identityOf(user)
      if (next !== identity) {
        const previous = identity
        identity = next
        invalidateLocalDataEpoch()
        cleanup = cleanup.then(async () => {
          const database = await getDatabase()
          // A late cleanup may only remove aliases of the departing identity.
          const oldScope = `${prefix}${previous}:`
          await database.runAsync('DELETE FROM entity_cache WHERE substr(entity_type, 1, ?) = ?', oldScope.length, oldScope)
        })
      }
    })
  }
}
const scope = async (entityType: string) => {
  subscribeIdentity()
  await cleanup
  const current = identityOf(await getStoredUser())
  if (!current) throw new Error('SESSION_CHANGED')
  identity = current
  return `${prefix}${current}:${entityType}`
}
export const resolveLocalEntityId = async (entityType: string, localId: string) => {
  if (!localId.startsWith('local-')) return localId
  const key = await scope(entityType)
  const database = await getDatabase()
  const row = await database.getFirstAsync<{ payload: string }>(
    'SELECT payload FROM entity_cache WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL', key, localId
  )
  return row ? String(JSON.parse(row.payload).serverId) : localId
}
export const recordLocalEntityId = async (entityType: string, localId: string, serverId: string, expectedIdentity: string) => {
  await assertLocalEntityIdentity(expectedIdentity)
  const key = await scope(entityType)
  const database = await getDatabase()
  if (key !== `${prefix}${identityOf(await getStoredUser())}:${entityType}`)
    throw new Error('SESSION_CHANGED')
  await assertLocalEntityIdentity(expectedIdentity)
  await database.runAsync(
    `INSERT INTO entity_cache (entity_type, entity_id, payload, version, updated_at, deleted_at)
     VALUES (?, ?, ?, '1', ?, NULL)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET payload = excluded.payload, deleted_at = NULL`,
    key, localId, JSON.stringify({ serverId }), new Date().toISOString()
  )
}
