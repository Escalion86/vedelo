import { createEventDraft } from '../../shared/domain/eventForm'
import { aiPlanSchema, discardAiReview, openAiReview, readAiReview, saveAiReview, type AiReview } from './aiReview'
const mockRows = new Map<string, any>(), mockOperations = new Map<string, any>()
const mockGet = jest.fn(), mockPost = jest.fn(), mockPublish = jest.fn(), mockSave = jest.fn()
let mockAlive = true, mockFailRemove = false, mockFailStore = false
const eventId = 'a'.repeat(24), planId = 'b'.repeat(24)
jest.mock('expo-crypto', () => ({ randomUUID: () => 'durable-operation' }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) } }))
jest.mock('../../shared/storage/cache', () => ({
  getCachedEntity: async (kind: string, id: string) => mockRows.get(`${kind}:${id}`) || null,
  listCachedEntities: async (kind: string) => [...mockRows].filter(([key]) => key.startsWith(`${kind}:`)).map(([, value]) => value),
  upsertEntities: async (kind: string, rows: any[]) => { if (mockFailStore) throw new Error('disk'); for (const row of rows) mockRows.set(`${kind}:${row._id}`, JSON.parse(JSON.stringify(row))) },
  removeCachedEntity: async (kind: string, id: string) => { if (mockFailRemove) throw new Error('disk'); mockRows.delete(`${kind}:${id}`) },
  publishEntityReadback: (...args: unknown[]) => mockPublish(...args),
}))
jest.mock('../../shared/storage/localEntityIds', () => ({ localEntityIdentity: async () => 'identity', assertLocalEntityIdentity: async () => {} }))
jest.mock('../../shared/storage/localEntityCoordination', () => ({ localDataEpoch: () => 1, assertLocalDataEpoch: () => {}, withLocalEntityWrite: async (fn: () => unknown) => fn() }))
jest.mock('../../shared/storage/outbox', () => ({ getOutboxOperation: async (id: string) => mockOperations.get(id) || null }))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: (...args: unknown[]) => mockSave(...args) }))
jest.mock('../../shared/sync/syncEngine', () => ({ runSync: async () => {} }))
const plan = aiPlanSchema.parse({ planId, eventId, eventTitle: 'Работа', clientName: 'Клиент', completed: [], expiresAt: '2030-01-01T00:00:00Z',
  eventPatch: { eventType: 'Предложение', additionalEvents: [{ _id: 'task', title: 'Связаться' }] }, clientPatch: null,
  steps: [{ entity: 'event', operation: 'update', description: '', changes: [{ field: 'eventType', label: 'Название', before: 'Было', after: 'Предложение' }] }] })
const preview = { _id: eventId, status: 'active' as const, eventType: 'Предложение', description: '<p>Сохранить HTML</p>', syncVersion: 2 }
const draft = createEventDraft(preview)
const current = () => mockAlive
beforeEach(() => {
  jest.clearAllMocks(); mockRows.clear(); mockOperations.clear(); mockAlive = true; mockFailRemove = false; mockFailStore = false
  mockGet.mockReset(); mockPost.mockReset(); mockPublish.mockReset(); mockSave.mockReset()
  mockRows.set(`__ai_event_review:${planId}`, { _id: planId, plan, preview } satisfies AiReview)
  mockGet.mockResolvedValue({ data: { ...preview, eventType: 'Предложение', syncVersion: 3 } })
  mockPost.mockResolvedValue({ ...plan, completed: [0], done: true })
  mockPublish.mockImplementation(async (kind, fresh) => { mockRows.set(`${kind}:${fresh._id}`, fresh); return fresh })
  mockSave.mockImplementation(async ({ values, operationId, entityId, entityType }) => {
    mockOperations.set(operationId, { entityType, entityId, payload: values })
    const saved = { ...mockRows.get(`events:${entityId}`), ...values, syncStatus: 'pending' }
    mockRows.set(`events:${entityId}`, saved); return saved
  })
})
it('opening a plan only reads the server and persists the ordinary preview', async () => {
  mockRows.clear()
  const review = await openAiReview(plan, current)
  expect(review.preview).toMatchObject({ eventType: 'Предложение', description: '<p>Сохранить HTML</p>', additionalEvents: [{ _id: 'task', title: 'Связаться' }] })
  expect(mockPost).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled()
  await discardAiReview(planId, current); expect(await readAiReview(planId)).toBeNull()
})
it('persists confirmation before apply; a lost response retries the same plan and frozen manual diff', async () => {
  mockPost.mockImplementationOnce(async () => {
    expect((await readAiReview(planId))?.attempt?.manualChanges).toEqual({ eventType: 'Ручное' })
    throw new Error('lost response')
  })
  await expect(saveAiReview(planId, draft, { eventType: 'Ручное' }, current)).rejects.toThrow('lost response')
  expect(mockSave).not.toHaveBeenCalled()
  await expect(discardAiReview(planId, current)).rejects.toThrow('уже начато')
  await saveAiReview(planId, draft, { eventType: 'Позднее' }, current)
  expect(mockPost.mock.calls).toEqual(Array(2).fill(['/events/ai-edit', { mode: 'apply', planId }]))
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ values: { eventType: 'Ручное' }, baseSnapshot: preview, operationId: 'durable-operation' }))
  expect(await readAiReview(planId)).toBeNull()
})
it('a restart after enqueue only reads its durable receipt, preserving newer local edits', async () => {
  mockFailRemove = true
  await expect(saveAiReview(planId, draft, { eventType: 'Ручное' }, current)).rejects.toThrow('disk')
  mockRows.set(`events:${eventId}`, { ...preview, eventType: 'Новая правка', syncStatus: 'pending' })
  mockFailRemove = false
  const saved = await saveAiReview(planId, draft, { eventType: 'Ручное' }, current)
  expect(saved.eventType).toBe('Новая правка')
  expect(mockPost).toHaveBeenCalledTimes(1); expect(mockSave).toHaveBeenCalledTimes(1)
})
it('double taps share one application and a server conflict keeps the attempt for recovery', async () => {
  mockPost.mockResolvedValue({ ...plan, completed: [], conflict: true, error: 'Конфликт PWA' })
  const a = saveAiReview(planId, draft, {}, current), b = saveAiReview(planId, draft, {}, current)
  expect(a).toBe(b)
  await expect(a).rejects.toThrow('Конфликт PWA')
  expect(mockPost).toHaveBeenCalledTimes(1); expect(mockSave).not.toHaveBeenCalled()
  expect((await readAiReview(planId))?.plan.conflict).toBe(true)
})
it('does not send apply if persistence fails, or publish a late response into another session', async () => {
  mockFailStore = true
  await expect(saveAiReview(planId, draft, {}, current)).rejects.toThrow('disk')
  expect(mockPost).not.toHaveBeenCalled()
  mockFailStore = false
  mockPost.mockImplementation(async () => { mockAlive = false; return { ...plan, done: true } })
  await expect(saveAiReview(planId, draft, {}, current)).rejects.toThrow('SESSION_CHANGED')
  expect(mockGet).not.toHaveBeenCalled(); expect(mockPublish).not.toHaveBeenCalled(); expect(mockSave).not.toHaveBeenCalled()
})
it('retains the attempt when local edits prevent readback and never overwrites them', async () => {
  mockPublish.mockRejectedValue(new Error('EVENT_HAS_LOCAL_CHANGES'))
  await expect(saveAiReview(planId, draft, { eventType: 'Ручное' }, current)).rejects.toThrow('EVENT_HAS_LOCAL_CHANGES')
  expect(mockSave).not.toHaveBeenCalled(); expect((await readAiReview(planId))?.attempt).toBeTruthy()
})
