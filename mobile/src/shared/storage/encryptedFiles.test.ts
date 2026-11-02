import { encryptAndQueueFile } from './encryptedFiles'
import { withLocalDataClear } from './localEntityCoordination'
import * as Crypto from 'expo-crypto'
const mockFiles = new Map<string, Uint8Array>(), mockRows = new Map<string, any>()
let mockEpoch = 1
const mockDatabase = {
  getFirstAsync: jest.fn(async (_sql: string, id: string) => mockRows.get(id) || null),
  runAsync: jest.fn(async (_sql: string, id: string, _operation: string, uri: string, _name: string, _mime: string, _size: number, kind: string, owner: string, attachment: string) => {
    mockRows.set(id, { entity_type: kind, entity_id: owner, attachment_kind: attachment, local_uri: uri, status: 'pending' })
  }),
}
jest.mock('./database', () => ({ getDatabase: async () => mockDatabase }))
jest.mock('../auth/tokenStore', () => ({ getAuthSessionEpoch: () => mockEpoch }))
jest.mock('../api/client', () => ({ api: {} }))
jest.mock('./cache', () => ({ upsertEntities: jest.fn() }))
jest.mock('../sync/syncState', () => ({ markSyncPending: jest.fn(), refreshSyncStateFromQueue: jest.fn() }))
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => 'test-key', setItemAsync: jest.fn() }))
jest.mock('expo-crypto', () => ({ AESEncryptionKey: { import: async () => ({}) }, aesEncryptAsync: jest.fn(), randomUUID: () => '44444444-4444-4444-8444-444444444444' }))
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents', cache: 'file:///cache' },
  Directory: class { uri: string; constructor(...parts: any[]) { this.uri = parts.map(p => p.uri || p).join('/') }; create() {} },
  File: class {
    uri: string
    constructor(...parts: any[]) { this.uri = parts.map(p => p.uri || p).join('/') }
    get exists() { return mockFiles.has(this.uri) }
    get size() { return mockFiles.get(this.uri)?.length || 0 }
    bytes = async () => mockFiles.get(this.uri)!
    create() { mockFiles.set(this.uri, new Uint8Array()) }
    write(value: Uint8Array) { mockFiles.set(this.uri, value) }
    delete() { mockFiles.delete(this.uri) }
  },
}))
const body = { uri: 'file:///source', name: 'test.pdf', size: 10, mimeType: 'application/pdf', entityType: 'events', entityId: 'a'.repeat(24), attachmentKind: 'entityDocument', requestId: '11111111-1111-4111-8111-111111111111' }
beforeEach(() => {
  jest.clearAllMocks(); mockFiles.clear(); mockRows.clear(); mockEpoch = 1
  mockFiles.set(body.uri, new Uint8Array(10))
  ;(Crypto.aesEncryptAsync as jest.Mock).mockImplementation(async () => ({ combined: async () => new Uint8Array(30) }))
})
it('parallel/replayed share enqueue uses one encrypted file and one row; changed target is rejected', async () => {
  const [a, b] = await Promise.all([encryptAndQueueFile(body), encryptAndQueueFile(body)])
  expect(a.id).toBe(b.id); expect(mockDatabase.runAsync).toHaveBeenCalledTimes(1)
  expect(mockFiles.size).toBe(2)
  await expect(encryptAndQueueFile({ ...body, entityId: 'b'.repeat(24) })).rejects.toThrow('другой записи')
})
it('a late encryption result after account change or data clear never writes into the new account', async () => {
  let finish: (value: unknown) => void = () => undefined
  ;(Crypto.aesEncryptAsync as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const pending = encryptAndQueueFile(body)
  while (!(Crypto.aesEncryptAsync as jest.Mock).mock.calls.length) await Promise.resolve()
  mockEpoch++
  const cleared = withLocalDataClear(async () => { mockRows.clear() })
  finish({ combined: async () => new Uint8Array(30) })
  await expect(pending).rejects.toThrow('SESSION_CHANGED'); await cleared
  expect(mockDatabase.runAsync).not.toHaveBeenCalled(); expect(mockFiles.size).toBe(1)
})
it('actual bytes, not claimed metadata, enforce the file limit', async () => {
  mockFiles.set(body.uri, new Uint8Array(5 * 1024 * 1024 + 1))
  await expect(encryptAndQueueFile(body)).rejects.toThrow()
  expect(Crypto.aesEncryptAsync).not.toHaveBeenCalled(); expect(mockDatabase.runAsync).not.toHaveBeenCalled()
})
