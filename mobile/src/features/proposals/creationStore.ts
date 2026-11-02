import * as Crypto from 'expo-crypto'
import type { BoundProposalOperation } from './identity'
import { getCachedEntity, removeCachedEntity, upsertEntities } from '../../shared/storage/cache'
import { assertLocalDataEpoch, localDataEpoch, withLocalEntityWrite } from '../../shared/storage/localEntityCoordination'
import { assertLocalEntityIdentity, localEntityIdentity } from '../../shared/storage/localEntityIds'

export type CreationKind = 'create-proposal' | 'create-template'
export type CreationOwner = { identity: string; epoch: number }
export type CreationAttempt = { _id: string; identity: string; kind: CreationKind; target: string; requestId: string; input: Record<string, unknown>; resultId?: string; cancelRequested?: boolean }
const collection = '__proposal_creation'
const key = (kind: CreationKind, target: string) => JSON.stringify([kind, target])
const withinSession = async <T>(check: BoundProposalOperation, work: () => Promise<T>) => {
  const epoch = localDataEpoch(), identity = await localEntityIdentity()
  if (identity !== check.identity) throw new Error('SESSION_CHANGED')
  return withLocalEntityWrite(async () => {
    assertLocalDataEpoch(epoch); await assertLocalEntityIdentity(identity); await check()
    const result = await work()
    assertLocalDataEpoch(epoch); await assertLocalEntityIdentity(identity); await check()
    return result
  })
}
const read = async (check: { identity: string }, kind: CreationKind, target: string) => {
  const row = await getCachedEntity<CreationAttempt>(collection, key(kind, target))
  if (row && (row.identity !== check.identity || row.kind !== kind || row.target !== target)) throw new Error('SESSION_CHANGED')
  return row
}
export const readCreationAttempt = (check: BoundProposalOperation, kind: CreationKind, target: string) => withinSession(check, () => read(check, kind, target))
export const beginCreationAttempt = (check: BoundProposalOperation, kind: CreationKind, target: string, input: Record<string, unknown>) => withinSession(check, async () => {
  if (await read(check, kind, target)) throw new Error('CREATE_OUTCOME_PENDING')
  const row: CreationAttempt = { _id: key(kind, target), identity: check.identity, kind, target, requestId: Crypto.randomUUID(), input }
  await check(); await upsertEntities(collection, [row]); return row
})
export const assertCreationOwner = async (owner: CreationOwner) => {
  assertLocalDataEpoch(owner.epoch); await assertLocalEntityIdentity(owner.identity); assertLocalDataEpoch(owner.epoch)
}
export const requestCreationCancellation = (check: BoundProposalOperation, attempt: CreationAttempt) => withinSession(check, async () => {
  const row = await read(check, attempt.kind, attempt.target)
  if (!row || row.requestId !== attempt.requestId) throw new Error('CREATE_OUTCOME_PENDING')
  const next = { ...row, cancelRequested: true }
  await check(); await upsertEntities(collection, [next]); return next
})
// A response may arrive after its view closes. Retain the receipt for that same
// local session, while still forbidding any late write after logout/account swap.
export const recordCreatedId = (owner: CreationOwner, attempt: CreationAttempt, resultId: string) => withLocalEntityWrite(async () => {
  await assertCreationOwner(owner)
  const row = await read(owner, attempt.kind, attempt.target)
  if (!row || row.requestId !== attempt.requestId || row.resultId && row.resultId !== resultId) throw new Error('CREATE_OUTCOME_PENDING')
  const next = { ...row, resultId }
  await assertCreationOwner(owner); await upsertEntities(collection, [next]); await assertCreationOwner(owner); return next
})
export const finishCreationAttempt = (check: BoundProposalOperation, attempt: CreationAttempt) => withinSession(check, async () => {
  const row = await read(check, attempt.kind, attempt.target)
  if (!row || row.requestId !== attempt.requestId) throw new Error('CREATE_OUTCOME_PENDING')
  await check(); await removeCachedEntity(collection, row._id)
})
