import { beginCallResult, finishCallResult, readCallResult } from './callResultStore'
import { invalidateLocalDataEpoch, withLocalDataClear } from '../storage/localEntityCoordination'
const mockCache = new Map<string, any>()
let mockIdentity = 'tenant-a'
jest.mock('expo-crypto', () => ({ randomUUID: () => 'request-a' }))
jest.mock('../storage/cache', () => ({ getCachedEntity: async (_type: string, id: string) => mockCache.get(id) || null, upsertEntities: async (_type: string, rows: any[]) => rows.forEach(row => mockCache.set(row._id, row)), removeCachedEntity: async (_type: string, id: string) => mockCache.delete(id) }))
jest.mock('../storage/localEntityIds', () => ({ localEntityIdentity: async () => mockIdentity, assertLocalEntityIdentity: async (expected: string) => { if (!expected || expected !== mockIdentity) throw Error('SESSION_CHANGED') } }))
const input = { phone: '79991234567', direction: 'unknown' as const, result: 'answered' as const, note: 'Заметка', clientId: null, eventId: null, nextContactAt: null, nextContactTitle: '' }
beforeEach(() => { mockCache.clear(); mockIdentity = 'tenant-a'; invalidateLocalDataEpoch() })
it('retry and reopening keep the original result; only its own acknowledgement clears it', async () => {
  const first = await beginCallResult(input)
  expect(await beginCallResult({ ...input, note: 'Другой' })).toEqual(first)
  await finishCallResult('another-request')
  expect(await readCallResult()).toEqual(first)
  await finishCallResult(first.requestId)
  expect(await readCallResult()).toBeNull()
})
it('logout prevents a queued attempt from restoring another account data', async () => {
  const pending = beginCallResult(input)
  const clear = withLocalDataClear(async () => { mockIdentity = ''; mockCache.clear() })
  await expect(pending).rejects.toThrow('SESSION_CHANGED')
  await clear; expect(mockCache.size).toBe(0)
})
