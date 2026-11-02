import * as Crypto from 'expo-crypto'
import { getCachedEntity, removeCachedEntity, upsertEntities } from '../storage/cache'
import { assertLocalEntityIdentity, localEntityIdentity } from '../storage/localEntityIds'
import { assertLocalDataEpoch, localDataEpoch, withLocalEntityWrite } from '../storage/localEntityCoordination'

export type AndroidCallResult = { requestId: string; phone: string; direction: 'incoming' | 'outgoing' | 'unknown'; result: 'answered' | 'no_answer' | 'callback' | 'follow_up'; note: string; clientId: string | null; eventId: string | null; nextContactAt: string | null; nextContactTitle: string }
const collection = '__android_call_result'
type Pending = AndroidCallResult & { _id: string }
export const readCallResult = () => getCachedEntity<Pending>(collection, 'pending')
export const beginCallResult = async (input: Omit<AndroidCallResult, 'requestId'>) => {
  const epoch = localDataEpoch(), identity = await localEntityIdentity()
  return withLocalEntityWrite(async () => {
    assertLocalDataEpoch(epoch); await assertLocalEntityIdentity(identity)
    const previous = await readCallResult()
    if (previous) return previous
    const pending = { ...input, _id: 'pending', requestId: Crypto.randomUUID() }
    assertLocalDataEpoch(epoch); await assertLocalEntityIdentity(identity)
    await upsertEntities(collection, [pending]); return pending
  })
}
export const finishCallResult = async (requestId: string) => {
  const epoch = localDataEpoch(), identity = await localEntityIdentity()
  await withLocalEntityWrite(async () => {
    assertLocalDataEpoch(epoch); await assertLocalEntityIdentity(identity)
    const pending = await readCallResult()
    assertLocalDataEpoch(epoch); await assertLocalEntityIdentity(identity)
    if (pending?.requestId === requestId) await removeCachedEntity(collection, 'pending')
  })
}
