import { beginGeneration, finishGeneration, readGeneration } from './generationStore'
import { invalidateLocalDataEpoch, withLocalDataClear } from '../../shared/storage/localEntityCoordination'

const mockCache = new Map<string, any>()
let mockIdentity = 'tenant-a'
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'request-a') }))
jest.mock('../../shared/storage/cache', () => ({
  getCachedEntity: async (_type: string, id: string) => mockCache.get(id) || null,
  upsertEntities: async (_type: string, values: any[]) => values.forEach(value => mockCache.set(value._id, value)),
  removeCachedEntity: async (_type: string, id: string) => mockCache.delete(id),
}))
jest.mock('../../shared/storage/localEntityIds', () => ({
  localEntityIdentity: async () => mockIdentity,
  assertLocalEntityIdentity: async (expected: string) => { if (!expected || expected !== mockIdentity) throw new Error('SESSION_CHANGED') },
}))
const input = { _id: 'event', templateId: 'template', documentDate: '2026-10-31', source: 'event' as const, allowEmpty: false }
beforeEach(() => { mockCache.clear(); mockIdentity = 'tenant-a'; invalidateLocalDataEpoch() })
it('restores the immutable attempt after reopening instead of using changed form values', async () => {
  const original = await beginGeneration(input)
  expect(await readGeneration(input._id)).toEqual(original)
  expect(await beginGeneration({ ...input, templateId: 'other' })).toEqual(original)
})
it('serializes simultaneous clicks and only clears the matching attempt', async () => {
  const [first, second] = await Promise.all([beginGeneration(input), beginGeneration(input)])
  expect(first).toEqual(second)
  await finishGeneration({ ...first, requestId: 'old-response' })
  expect(await readGeneration(input._id)).toEqual(first)
  await finishGeneration(first)
  expect(await readGeneration(input._id)).toBeNull()
})
it('logout invalidates a queued write and clears the attempt', async () => {
  const pending = beginGeneration(input)
  const cleared = withLocalDataClear(async () => { mockIdentity = ''; mockCache.clear() })
  await expect(pending).rejects.toThrow('SESSION_CHANGED')
  await cleared
  expect(mockCache.size).toBe(0)
})
