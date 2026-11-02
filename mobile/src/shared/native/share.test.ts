import { readIncomingShare, queueSharedFiles } from './share'
import { api } from '../api/client'
import { device } from './device'
import { getCachedEntity } from '../storage/cache'
import { encryptAndQueueFile } from '../storage/encryptedFiles'
import { consumeSharedDraft, readSharedDraft, setSharedDraft, clearSharedDraft } from './shareDraft'
let mockEpoch = 1, mockGeneration = 'g1'
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_: string, text: string) => require('node:crypto').createHash('sha256').update(text).digest('hex') }))
jest.mock('../api/client', () => ({ api: { get: jest.fn() } }))
jest.mock('../auth/tokenStore', () => ({ getAuthSessionEpoch: () => mockEpoch }))
jest.mock('../storage/cache', () => ({ getCachedEntity: jest.fn() }))
jest.mock('../storage/encryptedFiles', () => ({ encryptAndQueueFile: jest.fn() }))
jest.mock('./device', () => ({ deviceSession: () => ({ generation: mockGeneration }), device: { readShare: jest.fn(), exportSharedFile: jest.fn(), releaseSharedFile: jest.fn() } }))
const share = { id: '11111111-1111-4111-8111-111111111111', text: 'Заявка', problem: '', files: [
  { id: '22222222-2222-4222-8222-222222222222', name: 'test.pdf', mimeType: 'application/pdf', size: 100 },
  { id: '33333333-3333-4333-8333-333333333333', name: 'test.jpg', mimeType: 'image/jpeg', size: 100 },
] }
const id = 'a'.repeat(24)
beforeEach(() => {
  jest.clearAllMocks(); mockEpoch = 1; mockGeneration = 'g1'; clearSharedDraft()
  ;(api.get as jest.Mock).mockResolvedValue({ data: { _id: id } })
  ;(getCachedEntity as jest.Mock).mockResolvedValue({ _id: id })
  ;(device!.readShare as jest.Mock).mockResolvedValue(JSON.stringify(share))
  ;(device!.exportSharedFile as jest.Mock).mockResolvedValue('file:///own/share')
  ;(encryptAndQueueFile as jest.Mock).mockResolvedValue({ id: 'queued' })
})
it('preview is read-only; queues only selected files with stable IDs and releases the temporary copy', async () => {
  expect(await readIncomingShare(share.id)).toEqual(share)
  expect(api.get).not.toHaveBeenCalled(); expect(encryptAndQueueFile).not.toHaveBeenCalled()
  await queueSharedFiles(share, [share.files[0].id], 'events', id, () => true)
  await queueSharedFiles(share, [share.files[0].id], 'events', id, () => true)
  expect(device!.exportSharedFile).toHaveBeenCalledTimes(2)
  expect(encryptAndQueueFile).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'events', entityId: id, name: 'test.pdf', size: 100 }))
  expect((encryptAndQueueFile as jest.Mock).mock.calls[0][0].requestId).toBe((encryptAndQueueFile as jest.Mock).mock.calls[1][0].requestId)
  expect(device!.releaseSharedFile).toHaveBeenCalledTimes(2)
})
it.each([401, 403, 404, 409])('server %s cannot fall back to cached ownership', async (status) => {
  ;(api.get as jest.Mock).mockRejectedValue({ status })
  await expect(queueSharedFiles(share, [share.files[0].id], 'clients', id, () => true)).rejects.toEqual({ status })
  expect(encryptAndQueueFile).not.toHaveBeenCalled(); expect(device!.exportSharedFile).not.toHaveBeenCalled()
})
it('offline accepts only the current account cache; a late account change stops before writing', async () => {
  ;(api.get as jest.Mock).mockRejectedValue(new Error('offline'))
  ;(getCachedEntity as jest.Mock).mockResolvedValue(null)
  await expect(queueSharedFiles(share, [share.files[0].id], 'events', id, () => true)).rejects.toThrow()
  ;(getCachedEntity as jest.Mock).mockResolvedValue({ _id: id })
  ;(device!.exportSharedFile as jest.Mock).mockImplementation(async () => { mockEpoch++; return 'file:///old' })
  await expect(queueSharedFiles(share, [share.files[0].id], 'events', id, () => true)).rejects.toThrow('Сессия изменилась')
  expect(encryptAndQueueFile).not.toHaveBeenCalled(); expect(device!.releaseSharedFile).toHaveBeenCalledTimes(1)
})
it('an encryption error releases the copy and never declares success', async () => {
  ;(encryptAndQueueFile as jest.Mock).mockRejectedValue(new Error('disk full'))
  await expect(queueSharedFiles(share, [share.files[0].id], 'clients', id, () => true)).rejects.toThrow('disk full')
  expect(device!.releaseSharedFile).toHaveBeenCalledTimes(1)
})
it('draft text is bound to a native session; reading for StrictMode does not consume it', () => {
  setSharedDraft({ id: share.id, generation: 'g1', text: share.text, mode: 'manual' })
  expect(readSharedDraft(share.id, 'g2')).toBeNull()
  expect(readSharedDraft(share.id, 'g1')?.text).toBe(share.text)
  expect(readSharedDraft(share.id, 'g1')?.text).toBe(share.text)
  expect(consumeSharedDraft(share.id, 'g1')?.text).toBe(share.text)
  expect(readSharedDraft(share.id, 'g1')).toBeNull()
})
