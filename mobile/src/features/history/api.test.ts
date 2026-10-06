import NetInfo from '@react-native-community/netinfo'
import { availableHistoryRoute, buildHistoryPath, loadCachedHistory, loadHistoryPage, readHistoryResponse } from './api'
const mockRemove = jest.fn(); const mockGet = jest.fn(); const mockUpsert = jest.fn(); const mockList = jest.fn()
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args) } }))
jest.mock('../../shared/storage/cache', () => ({ removeCachedEntity: (...args: any[]) => mockRemove(...args), upsertEntities: (...args: any[]) => mockUpsert(...args), listCachedEntities: (...args: any[]) => mockList(...args) }))
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn() }))
const item = { id: 'history1', entityType: 'event' as const, entityId: 'a'.repeat(24), operation: 'update' as const, entityLabel: 'Работа', summary: 'Изменение', changes: [], occurredAt: '2026-10-01T00:00:00Z', entityExists: true }
const page = { success: true, data: [item], meta: { hasMore: false, nextCursor: null } }
beforeEach(() => { jest.resetAllMocks(); (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true }); mockGet.mockResolvedValue(page); mockList.mockResolvedValue([]); mockUpsert.mockResolvedValue(undefined) })
test.each([{ success: false, data: [], meta: { hasMore: false } }, { success: true, data: {}, meta: { hasMore: false } }, { ...page, data: [{ ...item, occurredAt: 'invalid' }] }, { ...page, meta: { hasMore: 'yes' } }, { ...page, meta: { hasMore: true, nextCursor: null } }, { ...page, meta: { hasMore: true, nextCursor: 'https://bad' } }])('success/meta/shape валидируются до cache', async (response) => { mockGet.mockResolvedValue(response); await expect(loadHistoryPage({})).rejects.toThrow(); expect(mockUpsert).not.toHaveBeenCalled() })
test('непродвигающийся cursor и пустая hasMore страница отвергаются', () => { expect(() => readHistoryResponse({ ...page, meta: { hasMore: true, nextCursor: 'cursor1' } }, 'cursor1')).toThrow(); expect(() => readHistoryResponse({ ...page, data: [], meta: { hasMore: true, nextCursor: 'cursor2' } })).toThrow() })
test('валидный ответ сохраняет прежний cache kind и shape, устаревший не сохраняется', async () => {
  await loadHistoryPage({}); expect(mockUpsert).toHaveBeenCalledWith('activityHistory', [{ ...item, _id: item.id, updatedAt: item.occurredAt }])
  mockUpsert.mockClear(); await loadHistoryPage({}, null, { current: () => false }); expect(mockUpsert).not.toHaveBeenCalled()
})
test('сбой сохранения помечается без потери актуального server result', async () => { mockUpsert.mockRejectedValue(new Error('cache')); expect(await loadHistoryPage({})).toMatchObject({ data: [item], cacheSaved: false }) })
test('кэш с invalid shape отфильтрован и local date filter применяется', async () => { mockList.mockResolvedValue([item, { ...item, id: 'older', occurredAt: '2026-09-01T00:00:00Z' }, { data: 'bad' }]); expect(await loadCachedHistory({ dateFrom: '2026-10-01' })).toEqual([item]) })
test('path экранирует поиск и посылает однозначные ISO границы', () => {
  const url = new URL(`https://local.example${buildHistoryPath({ search: 'Анна&source=secret', dateFrom: '2026-10-01', dateTo: '2026-10-03' }, 'cursor1')}`)
  expect(url.searchParams.get('search')).toBe('Анна&source=secret'); expect(url.searchParams.get('source')).toBeNull(); expect(url.searchParams.get('dateFrom')).toBe('2026-10-01T00:00:00.000Z'); expect(url.searchParams.get('dateTo')).toBe(new Date('2026-10-03T23:59:59.999').toISOString())
})
test.each(['event', 'client', 'transaction'] as const)('перед %s навигацией реальное tenant-scoped чтение', async (entityType) => {
  mockGet.mockResolvedValue({ success: true, data: entityType === 'transaction' ? [{ _id: item.entityId }] : { _id: item.entityId } })
  expect(await availableHistoryRoute({ ...item, entityType }, () => true)).toBe(entityType === 'event' ? `/events/${item.entityId}` : entityType === 'client' ? `/clients/${item.entityId}` : `/finance/edit/${item.entityId}`)
  expect(mockGet).toHaveBeenCalledWith(entityType === 'transaction' ? '/mobile/v1/transactions' : `/mobile/v1/${entityType === 'event' ? 'events' : 'clients'}/${item.entityId}`)
})
test.each([{ success: true, data: null }, { success: false, data: { _id: item.entityId } }, { success: true, data: { _id: 'b'.repeat(24) } }, { success: true, data: [{ _id: item.entityId }] }])('missing/foreign/invalid entity не открывается', async (response) => { mockGet.mockResolvedValue(response); expect(await availableHistoryRoute(item, () => true)).toBeNull() })
test.each([403, 404])('foreign/deleted HTTP %s не даёт route', async (status) => { mockGet.mockRejectedValue({ status }); await expect(availableHistoryRoute(item, () => true)).rejects.toEqual({ status }) })
test('offline и устаревший epoch не запрашивают detail', async () => {
  ;(NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false }); expect(await availableHistoryRoute(item, () => true)).toBeNull()
  ;(NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true }); expect(await availableHistoryRoute(item, () => false)).toBeNull(); expect(mockGet).not.toHaveBeenCalled()
})
test('исходный ID не нормализуется, произвольные типы/URL не становятся route', async () => {
  for (const entityId of [' '+item.entityId, item.entityId+' ', 'https://bad.example', '../clients']) expect(await availableHistoryRoute({ ...item, entityId }, () => true)).toBeNull()
  expect(await availableHistoryRoute({ ...item, entityType: 'wrong' as any }, () => true)).toBeNull(); expect(mockGet).not.toHaveBeenCalled()
})

test('смена сессии во время SQLite write удаляет stale rows до cached read', async () => {
  let current = true; let finish!: () => void
  mockUpsert.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
  const pending = loadHistoryPage({}, null, { current: () => current })
  // Wait until the write has actually started.
  while (!finish) await Promise.resolve()
  current = false
  const cached = loadCachedHistory({})
  expect(mockList).not.toHaveBeenCalled()
  finish(); await pending; await cached
  expect(mockRemove).toHaveBeenCalledWith('activityHistory', item.id)
  expect(mockList).toHaveBeenCalledTimes(1)
})
