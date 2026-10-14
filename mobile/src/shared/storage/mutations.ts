import * as Crypto from 'expo-crypto'
import { getCachedEntity, removeCachedEntity, upsertEntities } from './cache'
import {
  discardEntityOperations,
  enqueueOperation,
  mergePendingLocalCreate,
} from './outbox'
import { runSync } from '../sync/syncEngine'
import { assertLocalEntityIdentity, localEntityIdentity, resolveLocalEntityId } from './localEntityIds'
import { assertLocalDataEpoch, localDataEpoch, withLocalEntityWrite } from './localEntityCoordination'

export const saveLocalEntity = async <T extends Record<string, unknown>>({
  entityType,
  entityId,
  values,
}: {
  entityType: string
  entityId?: string
  values: T
}) => {
  const epoch = localDataEpoch()
  const identity = await localEntityIdentity()
  const saved = await withLocalEntityWrite(async () => {
    assertLocalDataEpoch(epoch)
    await assertLocalEntityIdentity(identity)
    const existing = entityId
      ? await getCachedEntity<Record<string, unknown>>(entityType, entityId)
      : null
    if (entityId?.startsWith('local-') && !existing)
      throw new Error('Не удалось определить сохранённую работу. Введённые данные сохранены; повторите чтение')
    const localId = existing?._id || entityId || `local-${Crypto.randomUUID()}`
    const now = new Date().toISOString()
    const entity = {
      ...(existing || {}),
      ...values,
      _id: localId,
      updatedAt: now,
      syncStatus: 'pending',
    }
    await assertLocalEntityIdentity(identity)
    assertLocalDataEpoch(epoch)
    await upsertEntities(entityType, [entity])
    const mergedLocalCreate =
      existing && localId.startsWith('local-')
        ? await mergePendingLocalCreate(entityType, localId, values)
        : false
    if (!mergedLocalCreate) await enqueueOperation({
      entityType,
      entityId: localId,
      method: existing ? 'update' : 'create',
      payload: values,
      baseVersion: existing?.syncVersion ? String(existing.syncVersion) : null,
      baseValues: existing
        ? Object.fromEntries(Object.keys(values).map((key) => [key, existing[key]]))
        : null,
      attachments: [],
    })
    return entity
  })
  assertLocalDataEpoch(epoch)
  runSync().catch(() => undefined)
  return saved
}

export const deleteLocalEntity = async (entityType: string, entityId: string) => {
  const epoch = localDataEpoch()
  const identity = await localEntityIdentity()
  const serverDelete = await withLocalEntityWrite(async () => {
    assertLocalDataEpoch(epoch)
    await assertLocalEntityIdentity(identity)
    const resolvedId = await resolveLocalEntityId(entityType, entityId)
    const existing = await getCachedEntity<Record<string, unknown>>(entityType, resolvedId)
    const currentId = existing?._id || resolvedId
    await assertLocalEntityIdentity(identity)
    assertLocalDataEpoch(epoch)
    await removeCachedEntity(entityType, currentId)
    if (!currentId.startsWith('local-')) {
      await enqueueOperation({
        entityType,
        entityId: currentId,
        method: 'delete',
        payload: {},
        baseVersion: existing?.syncVersion ? String(existing.syncVersion) : null,
        baseValues: null,
        attachments: [],
      })
      return true
    }
    await discardEntityOperations(entityType, currentId)
    return false
  })
  assertLocalDataEpoch(epoch)
  if (serverDelete) runSync().catch(() => undefined)
}
