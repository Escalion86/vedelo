import { createEventDraft } from '../../shared/domain/eventForm'
import { discardAiCreateReview, openAiCreateReview, readAiCreateReview, saveAiCreatedEvent, saveAiSuggestedClient } from './aiCreateReview'

const mockRows = new Map<string, any>(), mockReceipts = new Map<string, any>()
const mockGet = jest.fn(), mockPublish = jest.fn(), mockSave = jest.fn()
let mockAlive = true, mockUUID = 0, mockFailStore = false, mockFailRemove = false, mockFailClientLink = false
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUUID}` }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: unknown[]) => mockGet(...args) } }))
jest.mock('../../shared/storage/cache', () => ({
  getCachedEntity: async (kind: string, id: string) => mockRows.get(`${kind}:${id}`) || null,
  listCachedEntities: async (kind: string) => [...mockRows].filter(([key]) => key.startsWith(`${kind}:`)).map(([, value]) => value),
  upsertEntities: async (kind: string, rows: any[]) => {
    if (mockFailStore || mockFailClientLink && rows.some(row => row.clientId)) throw new Error('disk')
    for (const row of rows) mockRows.set(`${kind}:${row._id}`, JSON.parse(JSON.stringify(row)))
  },
  removeCachedEntity: async (kind: string, id: string) => { if (mockFailRemove) throw new Error('disk'); mockRows.delete(`${kind}:${id}`) },
  publishEntityReadback: (...args: unknown[]) => mockPublish(...args),
}))
jest.mock('../../shared/storage/localEntityIds', () => ({ localEntityIdentity: async () => 'identity', assertLocalEntityIdentity: async () => {}, resolveLocalEntityId: async (_kind: string, id: string) => id }))
jest.mock('../../shared/storage/localEntityCoordination', () => ({ localDataEpoch: () => 1, assertLocalDataEpoch: () => {}, withLocalEntityWrite: async (fn: () => unknown) => fn() }))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: (...args: unknown[]) => mockSave(...args) }))
const response = { fields: { eventType: 'Запрос', description: 'Проверить текст' }, aiFilledFields: ['eventType', 'description'], aiWarnings: [], clientCreated: false,
  clientDraft: { firstName: 'Анна', phone: 79992222222, preferredContactChannel: 'phone' } }
const current = () => mockAlive
const clientForm = { values: { firstName: 'Анна', phone: '79992222222' }, dates: [] }
beforeEach(() => {
  jest.clearAllMocks(); mockRows.clear(); mockReceipts.clear(); mockAlive = true; mockUUID = 0; mockFailStore = false; mockFailRemove = false; mockFailClientLink = false
  mockGet.mockReset(); mockSave.mockReset()
  mockSave.mockImplementation(async ({ values, operationId, entityType }) => {
    if (!mockReceipts.has(operationId)) mockReceipts.set(operationId, { ...values, _id: `local-${operationId}`, entityType })
    return mockReceipts.get(operationId)
  })
})
it('preview and cancellation never create a client or event; a legacy response fails closed', async () => {
  const review = await openAiCreateReview(response, 'Исходный текст', current)
  expect(await readAiCreateReview(review._id)).toMatchObject({ clientDraft: { firstName: 'Анна' }, sourceText: 'Исходный текст' })
  await discardAiCreateReview(review._id, current)
  expect(await readAiCreateReview(review._id)).toBeNull()
  expect(mockSave).not.toHaveBeenCalled(); expect(mockGet).not.toHaveBeenCalled()
  await expect(openAiCreateReview({ ...response, clientCreated: true }, '', current)).rejects.toThrow()
  const { clientDraft: _unused, ...old } = response
  await expect(openAiCreateReview(old, '', current)).rejects.toThrow()
})
it('existing client requires a protected read; denied or mismatched clients never enter the preview', async () => {
  const id = 'a'.repeat(24), input = { ...response, clientDraft: null, fields: { clientId: id } }
  mockGet.mockRejectedValueOnce(new Error('404'))
  await expect(openAiCreateReview(input, '', current)).rejects.toThrow('404')
  mockGet.mockResolvedValueOnce({ data: { _id: 'b'.repeat(24) } })
  await expect(openAiCreateReview(input, '', current)).rejects.toThrow('недоступен')
  expect(mockRows.size).toBe(0); expect(mockPublish).not.toHaveBeenCalled()
  mockGet.mockResolvedValue({ data: { _id: id, firstName: 'Своя карточка' } })
  await openAiCreateReview(input, '', current)
  expect(mockGet).toHaveBeenLastCalledWith(`/mobile/v1/clients/${id}`)
  expect(mockPublish).toHaveBeenCalledWith('clients', expect.objectContaining({ _id: id }), current, expect.any(Function), { allowMissing: true })
})
it('client confirmation survives a crash before linking it and retry uses the same operation and input', async () => {
  const review = await openAiCreateReview(response, '', current)
  mockFailClientLink = true
  await expect(saveAiSuggestedClient(review._id, { firstName: 'Проверено' }, clientForm, current)).rejects.toThrow('disk')
  const attempt = (await readAiCreateReview(review._id))!.clientAttempt!
  expect(attempt.values).toEqual({ firstName: 'Проверено' })
  mockFailClientLink = false
  const client = await saveAiSuggestedClient(review._id, { firstName: 'Поздний ввод' }, clientForm, current)
  expect(client.firstName).toBe('Проверено'); expect(mockReceipts.size).toBe(1)
  expect(mockSave.mock.calls.map(([args]) => args.operationId)).toEqual([attempt.operationId, attempt.operationId])
  expect((await readAiCreateReview(review._id))!.clientId).toBe(client._id)
  await discardAiCreateReview(review._id, current)
  expect(mockReceipts.size).toBe(1) // Explicitly saved client is retained after cancelling work.
})
it('services are verified and published before preview so a stale local list cannot silently drop them', async () => {
  const id = 'c'.repeat(24)
  mockGet.mockResolvedValue({ data: { _id: id, title: 'Услуга из PWA' } })
  const review = await openAiCreateReview({ ...response, fields: { servicesIds: [id] } }, '', current)
  expect(review.fields.servicesIds).toEqual([id])
  expect(mockGet).toHaveBeenCalledWith(`/mobile/v1/services/${id}`)
  expect(mockPublish).toHaveBeenCalledWith('services', expect.objectContaining({ _id: id }), current, expect.any(Function), { allowMissing: true })
  mockGet.mockRejectedValue(new Error('404'))
  await expect(openAiCreateReview({ ...response, fields: { servicesIds: ['d'.repeat(24)] } }, '', current)).rejects.toThrow('404')
  expect(mockRows.size).toBe(1)
})
it('a crash after durable event creation preserves frozen form and retries without another record', async () => {
  const review = await openAiCreateReview(response, '', current), form = createEventDraft()
  form.values.description = 'Подтверждено'
  mockFailRemove = true
  await expect(saveAiCreatedEvent(review._id, { description: 'Подтверждено' }, form, current)).rejects.toThrow('disk')
  expect((await readAiCreateReview(review._id))!.eventAttempt!.form.values.description).toBe('Подтверждено')
  await expect(discardAiCreateReview(review._id, current)).rejects.toThrow('уже начато')
  mockFailRemove = false
  const saved = await saveAiCreatedEvent(review._id, { description: 'Другое' }, createEventDraft(), current)
  expect(saved.description).toBe('Подтверждено'); expect(mockReceipts.size).toBe(1)
  expect(await readAiCreateReview(review._id)).toBeNull()
})
it('does not create if confirmation cannot persist; a changed session cannot store a late response', async () => {
  const review = await openAiCreateReview(response, '', current)
  mockFailStore = true
  await expect(saveAiCreatedEvent(review._id, {}, createEventDraft(), current)).rejects.toThrow('disk')
  expect(mockSave).not.toHaveBeenCalled()
  mockFailStore = false; mockRows.clear()
  const id = 'a'.repeat(24)
  mockGet.mockImplementation(async () => { mockAlive = false; return { data: { _id: id } } })
  await expect(openAiCreateReview({ ...response, fields: { clientId: id } }, '', current)).rejects.toThrow('SESSION_CHANGED')
  expect(mockPublish).not.toHaveBeenCalled(); expect(mockRows.size).toBe(0)
})
it('a completed local write cannot restore a review after logout clears local data', async () => {
  const review = await openAiCreateReview(response, '', current)
  mockSave.mockImplementation(async () => { mockAlive = false; mockRows.clear(); return { _id: 'local-confirmed' } })
  await expect(saveAiSuggestedClient(review._id, {}, clientForm, current)).rejects.toThrow('SESSION_CHANGED')
  expect(mockRows.size).toBe(0)
})
