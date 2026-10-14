// Штатно discoverable regression: настоящая storage/API/identity/schema граница.
import { getCachedEntity, publishEntityReadback, upsertEntities } from './cache'
import { clearLocalData, getDatabase } from './database'
import { saveLocalEntity } from './mutations'
import { runSync } from '../sync/syncEngine'
import { setAuthSession } from '../auth/tokenStore'
import { proposalIdentity } from '../../features/proposals/identity'
import { proposalsApi } from '../../features/proposals/api'
import { proposalOperations } from '../../features/proposals/operations'

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => require('../../../__tests__/stageN/sqlPlatform.cjs').sqlite }))
jest.mock('expo-secure-store', () => require('../../../__tests__/stageN/sqlPlatform.cjs').secureStore)
jest.mock('expo-file-system', () => require('../../../__tests__/stageN/sqlPlatform.cjs').files)
jest.mock('expo-crypto', () => ({ randomUUID: () => require('../../../__tests__/stageN/sqlPlatform.cjs').randomUUID() }))
jest.mock('@react-native-community/netinfo', () => ({ fetch: async () => ({ isConnected: false }) }))
jest.mock('../config/env', () => ({ env: { apiBaseUrl: 'https://synthetic.invalid/api' } }))
// UI hook не вызывается. Identity capture читает настоящий tokenStore/SecureStore.
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => { throw Error('UI is outside storage regression') } }))
jest.mock('expo-application', () => ({ getAndroidId: () => 'test-device', nativeApplicationVersion: 'test' }))
jest.mock('expo-device', () => ({ modelName: 'test-device' }))
const platform = require('../../../__tests__/stageN/sqlPlatform.cjs')
const user = { _id: 'stage-n-user', tenantId: 'stage-n-tenant' } as any
const session = async (next = user) => setAuthSession({ user: next, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresIn: 0, tokenType: 'Bearer' })
const seed = async () => upsertEntities('events', [{ _id: 'event', syncStatus: 'synced', syncVersion: 1, description: 'Сохранённое описание', documents: [{ name: 'Договор' }] }])
const originalFetch = global.fetch
const publish = jest.fn()
beforeEach(async () => { await runSync(); await clearLocalData(); await session(); publish.mockClear() })
afterEach(async () => { await runSync(); global.fetch = originalFetch })
afterAll(async () => { await clearLocalData(); platform.close() })

it('real bound API schema read is merged, committed and reread before UI publication', async () => {
  await seed()
  const transport = jest.fn(async (_url: unknown, options: any) => {
    expect(options.skipAuth).toBeUndefined() // Shared client consumes this flag, fetch receives HTTP options.
    expect(options.headers.Authorization).toBe('Bearer synthetic-access')
    return { ok: true, status: 200, json: async () => ({ success: true, data: { _id: 'event', status: 'active', contractSum: 900, syncVersion: 3 } }) } as Response
  })
  global.fetch = transport
  const fresh = await proposalsApi.readEvent('event', { expectedIdentity: proposalIdentity(user) })
  const merged = await publishEntityReadback('events', fresh, () => true, publish)
  expect(transport).toHaveBeenCalledTimes(1)
  expect(publish).toHaveBeenCalledWith(merged)
  expect(await getCachedEntity('events', 'event')).toMatchObject({ _id: 'event', contractSum: 900, description: 'Сохранённое описание', documents: [{ name: 'Договор' }], syncVersion: 3 })
  expect(platform.rows('outbox')).toHaveLength(0)
  expect(proposalOperations.get(proposalIdentity(user), 'apply', 'unknown')).toBeUndefined()
})
it('invalid real API payload is rejected by schema before storage publication', async () => {
  await seed()
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: { _id: 'event', status: 'INVALID' } }) } as Response))
  await expect(proposalsApi.readEvent('event', { expectedIdentity: proposalIdentity(user) })).rejects.toThrow()
  expect(publish).not.toHaveBeenCalled()
  expect(await getCachedEntity('events', 'event')).not.toHaveProperty('contractSum')
})
it('real local save/outbox blocks readback instead of overwriting unsynced input', async () => {
  await seed()
  await saveLocalEntity({ entityType: 'events', entityId: 'event', values: { description: 'Локальная правка' } })
  await runSync()
  await expect(publishEntityReadback('events', { _id: 'event', contractSum: 900 }, () => true, publish)).rejects.toThrow('EVENT_HAS_LOCAL_CHANGES')
  expect(await getCachedEntity('events', 'event')).toMatchObject({ description: 'Локальная правка', syncStatus: 'pending' })
  expect(platform.rows('outbox')).toHaveLength(1)
  expect(publish).not.toHaveBeenCalled()
})
it('clear drains an already dispatched SQL readback and prevents late UI publication', async () => {
  await seed()
  const g = platform.delaySql((sql: string) => sql.startsWith('INSERT INTO entity_cache'))
  const pending = publishEntityReadback('events', { _id: 'event', contractSum: 900 }, () => true, publish)
  const rejected = expect(pending).rejects.toThrow('SESSION_CHANGED')
  await g.entered
  const clear = clearLocalData()
  g.release()
  await Promise.all([rejected, clear])
  expect(await getCachedEntity('events', 'event')).toBeNull()
  expect(platform.rows('outbox')).toHaveLength(0)
  expect(publish).not.toHaveBeenCalled()
})
it('readback owns the real queue until publish, then a local save wins', async () => {
  await seed()
  const g = platform.delaySql((sql: string) => sql.startsWith('INSERT INTO entity_cache'))
  const pending = publishEntityReadback('events', { _id: 'event', contractSum: 900 }, () => true, publish)
  await g.entered
  const save = saveLocalEntity({ entityType: 'events', entityId: 'event', values: { contractSum: 1200, description: 'Локальная правка после readback' } })
  g.release()
  await Promise.all([pending, save]); await runSync()
  expect(publish).toHaveBeenCalledTimes(1)
  expect(publish.mock.calls[0][0].contractSum).toBe(900)
  expect(await getCachedEntity('events', 'event')).toMatchObject({ contractSum: 1200, description: 'Локальная правка после readback', syncStatus: 'pending' })
  expect(platform.rows('outbox')).toHaveLength(1)
})
it('identity change in the pre-capture await cancels readback without a write', async () => {
  await seed()
  const g = platform.delayIdentity()
  const pending = publishEntityReadback('events', { _id: 'event', contractSum: 900 }, () => true, publish)
  const rejected = expect(pending).rejects.toThrow('SESSION_CHANGED')
  await g.entered
  await session({ _id: 'other', tenantId: 'other' })
  g.release(); await rejected
  expect(await getCachedEntity('events', 'event')).not.toHaveProperty('contractSum')
  expect(publish).not.toHaveBeenCalled()
})
it('missing entity and an inactive consumer cannot publish unconditional success', async () => {
  await expect(publishEntityReadback('events', { _id: 'missing' }, () => true, publish)).rejects.toThrow('EVENT_HAS_LOCAL_CHANGES')
  await seed()
  await expect(publishEntityReadback('events', { _id: 'event' }, () => false, publish)).rejects.toThrow('SESSION_CHANGED')
  expect(publish).not.toHaveBeenCalled()
  const db = await getDatabase()
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 3 })
})
