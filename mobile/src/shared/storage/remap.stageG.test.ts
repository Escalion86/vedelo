import { getCachedEntity } from './cache'
import { saveLocalEntity } from './mutations'
import { runSync } from '../sync/syncEngine'
import { clearLocalData, getDatabase } from './database'
const mockPost = jest.fn()
let mockUser = { _id: 'u1', tenantId: 'tenant' }, mockOnline = false, mockFailRead = false
let mockDeletionProbe: (() => Promise<void>) | null = null
const sqlite = process.getBuiltinModule('node:sqlite') as any
let mockDb: any, mockUUID = 0
let mockSessionListener: any
jest.mock('expo-crypto', () => ({ randomUUID: () => `synthetic-${++mockUUID}` }))
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => 'synthetic-key', WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1 }))
jest.mock('expo-file-system', () => ({ Directory: class { exists = false }, Paths: { document: 'unused' } }))
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => mockDb }))
jest.mock('../auth/tokenStore', () => ({ getStoredUser: async () => mockUser, subscribeAuthSession: (listener: any) => { mockSessionListener = listener; return () => {} } }))
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: async () => ({ isConnected: mockOnline }) } }))
jest.mock('../api/client', () => ({ api: { post: (...a: any[]) => mockPost(...a), get: async () => ({ data: { cursor: 'cursor', entities: {}, tombstones: [] } }) } }))
jest.mock('./encryptedFiles', () => ({ syncFileQueue: async () => {} }))
beforeAll(async () => {
 const db = new sqlite.DatabaseSync(':memory:')
 mockDb = {
  execAsync: async (sql: string) => { if (!sql.startsWith('PRAGMA key')) db.exec(sql) },
  getFirstAsync: async (sql: string, ...args: any[]) => {
   if (sql === 'PRAGMA cipher_version') return { cipher_version: 'synthetic-cipher-for-test' }
   if (mockFailRead && sql.includes('FROM entity_cache')) { mockFailRead = false; throw Error('readback failed') }
   return db.prepare(sql).get(...args) || null
  },
  getAllAsync: async (sql: string, ...args: any[]) => db.prepare(sql).all(...args),
  runAsync: async (sql: string, ...args: any[]) => {
   const result = db.prepare(sql).run(...args)
   if (sql.startsWith('DELETE FROM entity_cache') && mockDeletionProbe) { const probe = mockDeletionProbe; mockDeletionProbe = null; await probe() }
   return result
  },
  withTransactionAsync: async (fn: () => Promise<void>) => { db.exec('BEGIN'); try { await fn(); db.exec('COMMIT') } catch (e) { db.exec('ROLLBACK'); throw e } },
 }
 await getDatabase()
})
beforeEach(async () => { mockDeletionProbe = null; mockFailRead = false; mockOnline = false; mockUser = { _id: 'u1', tenantId: 'tenant' }; mockPost.mockReset(); await clearLocalData() })
it('A-LOCAL-ID-01 save/readback failure/applied real sync/remap/retry updates one server work with user input', async () => {
 const local = await saveLocalEntity({ entityType: 'events', values: { title: 'Первый ввод' } }); await runSync()
 mockFailRead = true; await expect(getCachedEntity('events', local._id)).rejects.toThrow('readback failed')
 mockPost.mockImplementation(async (_path, { operations }) => {
  const op = operations[0]
  return { data: { results: [{ operationId: op.operationId, status: 'applied', entityType: 'events', localEntityId: op.entityId, entity: { _id: 'server', title: op.payload.title, syncVersion: 2 } }] } }
 })
 mockDeletionProbe = async () => {
  // Real cache lookup in the removal window, not a fabricated getCachedEntity return.
  expect(await getCachedEntity('events', local._id)).toMatchObject({ _id: 'server', title: 'Первый ввод' })
 }
 mockOnline = true; await runSync()
 expect(mockDeletionProbe).toBeNull()
 mockSessionListener(mockUser)
 expect(await getCachedEntity('events', local._id)).toMatchObject({ _id: 'server' })
 await saveLocalEntity({ entityType: 'events', entityId: local._id, values: { title: 'Исправленный ввод' } }); await runSync()
 const operations = mockPost.mock.calls.map(c => c[1].operations[0])
 expect(operations.map(o => o.method)).toEqual(['create', 'update'])
 expect(operations[1]).toMatchObject({ entityId: 'server', payload: { title: 'Исправленный ввод' } })
 expect(await getCachedEntity('events', 'server')).toMatchObject({ title: 'Исправленный ввод' })
 mockUser = { _id: 'u2', tenantId: 'tenant' }
 mockSessionListener(mockUser)
 expect(await getCachedEntity('events', local._id)).toBeNull()
 const cleared = await getDatabase()
 expect(await cleared.getAllAsync("SELECT * FROM entity_cache WHERE entity_type LIKE '__local_id_map:%'")).toHaveLength(0)
 await clearLocalData(); mockUser = { _id: 'u1', tenantId: 'tenant' }
 expect(await getCachedEntity('events', local._id)).toBeNull()
 const db = await getDatabase(); expect(await db.getAllAsync('SELECT * FROM entity_cache')).toHaveLength(0)
})
it('A-LOCAL-ID-01 missing local ID fails closed rather than enqueueing a second create', async () => {
 await expect(saveLocalEntity({ entityType: 'events', entityId: 'local-missing', values: { title: 'Сохранить ввод' } })).rejects.toThrow()
 const db = await getDatabase(); expect(await db.getAllAsync('SELECT * FROM outbox')).toHaveLength(0)
})
it('A-LOCAL-ID-01 delayed applied result cannot publish a mapping under a replacement session', async () => {
 const local = await saveLocalEntity({ entityType: 'events', values: { title: 'Старый tenant' } }); await runSync()
 let finish!: (v: any) => void, operation: any
 mockPost.mockImplementation(async (_path, body) => { operation = body.operations[0]; return new Promise(r => { finish = r }) })
 mockOnline = true; const syncing = runSync()
 // Wait for the real sync POST to enter the platform seam.
 for (let i = 0; !finish && i < 100; i++) await new Promise(r => setTimeout(r, 1))
 expect(finish).toBeDefined()
 mockUser = { _id: 'u2', tenantId: 'other' }; mockSessionListener(mockUser)
 await clearLocalData()
 finish({ data: { results: [{ operationId: operation.operationId, status: 'applied', entityType: 'events', localEntityId: local._id, entity: { _id: 'old-server', title: 'Старый tenant' } }] } })
 await syncing
 expect(await getCachedEntity('events', local._id)).toBeNull()
 expect(await getCachedEntity('events', 'old-server')).toBeNull()
 const db = await getDatabase(); expect(await db.getAllAsync("SELECT * FROM entity_cache WHERE entity_type LIKE '__local_id_map:%'")).toHaveLength(0)
})
