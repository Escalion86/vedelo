import * as Crypto from 'expo-crypto'
import { getCachedEntity, removeCachedEntity, upsertEntities } from '../../shared/storage/cache'
import { assertLocalEntityIdentity, localEntityIdentity } from '../../shared/storage/localEntityIds'
import { assertLocalDataEpoch, localDataEpoch, withLocalEntityWrite } from '../../shared/storage/localEntityCoordination'

export type DocumentGeneration = {
  _id: string
  requestId: string
  templateId: string
  documentDate: string
  source: 'event' | 'proposal'
  allowEmpty: boolean
}
// Internal SQLCipher cache only; never included in sync collections.
const collection = '__document_generation'
export const readGeneration = (eventId: string) => getCachedEntity<DocumentGeneration>(collection, eventId)
export const beginGeneration = async (input: Omit<DocumentGeneration, 'requestId'>) => {
  const epoch = localDataEpoch(), identity = await localEntityIdentity()
  return withLocalEntityWrite(async () => {
    assertLocalDataEpoch(epoch)
    await assertLocalEntityIdentity(identity)
    const existing = await readGeneration(input._id)
    if (existing) return existing
    const operation = { ...input, requestId: Crypto.randomUUID() }
    await assertLocalEntityIdentity(identity)
    assertLocalDataEpoch(epoch)
    await upsertEntities(collection, [operation])
    return operation
  })
}
export const finishGeneration = async (operation: DocumentGeneration) => {
  const epoch = localDataEpoch(), identity = await localEntityIdentity()
  await withLocalEntityWrite(async () => {
    assertLocalDataEpoch(epoch)
    await assertLocalEntityIdentity(identity)
    const pending = await readGeneration(operation._id)
    await assertLocalEntityIdentity(identity)
    assertLocalDataEpoch(epoch)
    if (pending?.requestId === operation.requestId) await removeCachedEntity(collection, operation._id)
  })
}
