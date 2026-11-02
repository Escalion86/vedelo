import * as Crypto from 'expo-crypto'
import { getCachedEntity, removeCachedEntity, upsertEntities } from './cache'
import {
  discardEntityOperations,
  enqueueOperation,
  getOutboxOperation,
  mergePendingLocalCreate,
} from './outbox'
import { runSync } from '../sync/syncEngine'
import { assertLocalEntityIdentity, localEntityIdentity, resolveLocalEntityId } from './localEntityIds'
import { assertLocalDataEpoch, localDataEpoch, withLocalEntityWrite } from './localEntityCoordination'
import { resolveOperationPayload, sameOperationPayload } from './operationIdentity'
import { markSyncPending } from '../sync/syncState'

export const saveLocalEntity = async <T extends Record<string, unknown>>({
  entityType,
  entityId,
  values,
  baseSnapshot,
  operationId,
}: {
  entityType: string
  entityId?: string
  values: T
  baseSnapshot?: Record<string, unknown>
  operationId?: string
}) => {
  const epoch = localDataEpoch()
  const identity = await localEntityIdentity()
  const saved = await withLocalEntityWrite(async () => {
    assertLocalDataEpoch(epoch)
    await assertLocalEntityIdentity(identity)
    if (operationId) {
      values = await resolveOperationPayload(values)
      const prior = await getOutboxOperation(operationId)
      if (prior) {
        const expectedId = await resolveLocalEntityId(entityType, entityId || `local-${operationId}`)
        const priorId = await resolveLocalEntityId(entityType, prior.entityId)
        if (prior.entityType !== entityType || priorId !== expectedId || prior.method !== (entityId ? 'update' : 'create') ||
          !await sameOperationPayload(prior.payload, values)) throw new Error('OPERATION_CHANGED')
        const saved = await getCachedEntity<Record<string, unknown>>(entityType, prior.entityId)
        if (!saved) throw new Error('Сохранённая запись удалена. Нужна ручная сверка')
        assertLocalDataEpoch(epoch); await assertLocalEntityIdentity(identity)
        return saved
      }
    }
    const requestedId = entityId || (operationId ? `local-${operationId}` : undefined)
    const existing = requestedId
      ? await getCachedEntity<Record<string, unknown>>(entityType, requestedId)
      : null
    if (entityId?.startsWith('local-') && !existing)
      throw new Error('Не удалось определить сохранённую работу. Введённые данные сохранены; повторите чтение')
    const localId = existing?._id || requestedId || `local-${Crypto.randomUUID()}`
    if (existing && Object.keys(values).length === 0) return existing
    const base = baseSnapshot || existing
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
    if (operationId) {
      if (entityId && (!existing || String(localId).startsWith('local-'))) throw new Error('Для подтверждённой правки нужна синхронизированная запись')
      if (!entityId && existing) throw new Error('Сохранённая операция не найдена. Нужна ручная сверка')
      await upsertEntities(entityType, [entity], () => enqueueOperation({
        entityType, entityId: String(localId), method: entityId ? 'update' : 'create', payload: values,
        baseVersion: base?.syncVersion ? String(base.syncVersion) : null,
        baseValues: base ? Object.fromEntries(Object.keys(values).map(key => [key, base[key]])) : null,
        attachments: [],
      }, operationId, false))
      await markSyncPending()
      return entity
    }
    await upsertEntities(entityType, [entity])
    const mergedLocalCreate =
      existing && localId.startsWith('local-')
        ? await mergePendingLocalCreate(entityType, localId, values)
        : false
    if (!mergedLocalCreate) {
      const operation = {
        entityType,
        entityId: localId,
        method: existing ? 'update' as const : 'create' as const,
        payload: values,
        baseVersion: base?.syncVersion ? String(base.syncVersion) : null,
        baseValues: base
          ? Object.fromEntries(Object.keys(values).map((key) => [key, base[key]]))
          : null,
        attachments: [],
      }
      await enqueueOperation(operation)
    }
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
