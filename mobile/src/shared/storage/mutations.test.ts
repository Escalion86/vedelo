import { saveLocalEntity } from './mutations'

const mockGet = jest.fn(), mockUpsert = jest.fn(), mockEnqueue = jest.fn()
const mockOperation = jest.fn()
jest.mock('expo-crypto', () => ({ randomUUID: () => 'created' }))
jest.mock('./cache', () => ({ getCachedEntity: (...args: unknown[]) => mockGet(...args), upsertEntities: (...args: unknown[]) => mockUpsert(...args) }))
jest.mock('./outbox', () => ({ getOutboxOperation: (...args: unknown[]) => mockOperation(...args), enqueueOperation: (...args: unknown[]) => mockEnqueue(...args), mergePendingLocalCreate: async () => false }))
jest.mock('../sync/syncEngine', () => ({ runSync: async () => {} }))
jest.mock('./localEntityIds', () => ({ localEntityIdentity: async () => 'user:tenant', assertLocalEntityIdentity: async () => {}, resolveLocalEntityId: async (_kind: string, id: string) => id }))
jest.mock('./localEntityCoordination', () => ({ localDataEpoch: () => 1, assertLocalDataEpoch: () => {}, withLocalEntityWrite: (fn: () => unknown) => fn() }))

beforeEach(() => { jest.clearAllMocks(); mockOperation.mockReset() })
it('keeps newer untouched cache fields but compares changed fields against the opened form version', async () => {
  const original = { _id: 'event', eventType: 'Исходное', description: 'Было', syncVersion: 2 }
  mockGet.mockResolvedValue({ ...original, description: 'Из PWA', eventType: 'Другое в PWA', syncVersion: 3, agreedProposal: { title: 'Согласовано' } })
  const result = await saveLocalEntity({ entityType: 'events', entityId: 'event', values: { eventType: 'Введено в APK' }, baseSnapshot: original })
  expect(result).toMatchObject({ eventType: 'Введено в APK', description: 'Из PWA', agreedProposal: { title: 'Согласовано' } })
  expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ baseVersion: '2', baseValues: { eventType: 'Исходное' }, payload: { eventType: 'Введено в APK' } }))
})
it('does not enqueue an unchanged edit', async () => {
  mockGet.mockResolvedValue({ _id: 'event', syncStatus: 'synced' })
  expect(await saveLocalEntity({ entityType: 'events', entityId: 'event', values: {} })).toEqual({ _id: 'event', syncStatus: 'synced' })
  expect(mockEnqueue).not.toHaveBeenCalled(); expect(mockUpsert).not.toHaveBeenCalled()
})
it.each(['pending', 'synced', 'conflict'])('a durable %s operation is read back without replacing cache or enqueuing again', async status => {
  const values = { eventType: 'Ручная правка' }
  mockOperation.mockResolvedValue({ operationId: 'stable', entityType: 'events', entityId: 'event', method: 'update', payload: values, status })
  mockGet.mockResolvedValue({ _id: 'event', eventType: 'Более поздняя правка', syncStatus: status })
  const saved = await saveLocalEntity({ entityType: 'events', entityId: 'event', values, operationId: 'stable' })
  expect(saved.eventType).toBe('Более поздняя правка')
  expect(mockUpsert).not.toHaveBeenCalled(); expect(mockEnqueue).not.toHaveBeenCalled()
})
it('does not reuse an operation for another payload or recreate a deleted record', async () => {
  mockOperation.mockResolvedValue({ entityType: 'events', entityId: 'event', method: 'update', payload: { eventType: 'Первое' } })
  await expect(saveLocalEntity({ entityType: 'events', entityId: 'event', values: { eventType: 'Второе' }, operationId: 'stable' })).rejects.toThrow('OPERATION_CHANGED')
  mockGet.mockResolvedValue(null)
  await expect(saveLocalEntity({ entityType: 'events', entityId: 'event', values: { eventType: 'Первое' }, operationId: 'stable' })).rejects.toThrow('удалена')
  expect(mockEnqueue).not.toHaveBeenCalled()
})
