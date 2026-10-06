import * as Sharing from 'expo-sharing'
import { shareExportCsv } from './exportNative'
import { exportDeferred, flushExport } from './exportFixtures'
const mockFiles = new Map<string, string>(), mockDeleted: string[] = []
let mockUuid = 0, mockFailWrite = false, mockFailDelete = false, mockFailCreate = false
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockUuid}` }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }))
jest.mock('expo-file-system', () => ({ Paths: { cache: { uri: 'file:///cache' } }, File: class {
  uri: string
  constructor(base: { uri: string }, name: string) { this.uri = `${base.uri}/${name}` }
  get exists() { return mockFiles.has(this.uri) }
  create() { mockFiles.set(this.uri, ''); if (mockFailCreate) throw new Error('PARTIAL_CREATE') }
  write(text: string) { if (mockFailWrite) throw new Error('WRITE'); mockFiles.set(this.uri, text) }
  delete() { mockDeleted.push(this.uri); if (mockFailDelete) throw new Error('DELETE'); mockFiles.delete(this.uri) }
} }))
beforeEach(() => { jest.resetAllMocks(); mockFiles.clear(); mockDeleted.length = 0; mockUuid = 0; mockFailWrite = false; mockFailDelete = false; mockFailCreate = false; (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true); (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined) })
it('уникальные temporary File/Paths; cleanup после void success/cancel; пользовательские оригиналы сохранены', async () => {
  mockFiles.set('file:///user/original.csv', 'ORIGINAL')
  for (const key of ['events', 'requests', 'transactions'] as const) expect(await shareExportCsv(key, '\ufeffCSV', () => true)).toEqual({ opened: true, error: false, cleanupFailed: false })
  expect(mockDeleted).toEqual(['file:///cache/vedelo-events-id-1.csv', 'file:///cache/vedelo-requests-id-2.csv', 'file:///cache/vedelo-transactions-id-3.csv'])
  expect([...mockFiles]).toEqual([['file:///user/original.csv', 'ORIGINAL']]); expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ mimeType: 'text/csv' }))
})
it.each(['write', 'create', 'share'])('ошибка %s очищает созданную копию', async step => {
  if (step === 'write') mockFailWrite = true
  if (step === 'create') mockFailCreate = true
  if (step === 'share') (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error('PRIVATE'))
  expect(await shareExportCsv('events', 'CSV', () => true)).toEqual({ opened: false, error: true, cleanupFailed: false }); expect(mockFiles.size).toBe(0)
})
it('cleanup error сообщается', async () => { mockFailDelete = true; expect((await shareExportCsv('events', 'CSV', () => true)).cleanupFailed).toBe(true); expect(mockFiles.size).toBe(1) })
it('sharing unavailable не создаёт файл', async () => { (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false); expect((await shareExportCsv('events', 'CSV', () => true)).error).toBe(true); expect(mockDeleted).toHaveLength(0) })
it('коллизия имени не удаляет и не переписывает существующий файл', async () => {
  mockFiles.set('file:///cache/vedelo-events-id-1.csv', 'KEEP'); expect((await shareExportCsv('events', 'CSV', () => true)).error).toBe(true)
  expect(mockFiles.get('file:///cache/vedelo-events-id-1.csv')).toBe('KEEP'); expect(mockDeleted).toEqual([])
})
it('late isAvailable после blur не создаёт file; stale start не вызывает API', async () => {
  const wait = exportDeferred<boolean>(); (Sharing.isAvailableAsync as jest.Mock).mockReturnValueOnce(wait.promise); let current = true
  const run = shareExportCsv('events', 'CSV', () => current); current = false; wait.resolve(true); expect((await run).opened).toBe(false); expect(mockDeleted).toEqual([])
  await shareExportCsv('requests', 'CSV', () => false); expect(Sharing.isAvailableAsync).toHaveBeenCalledTimes(1)
})
it('late share result после unmount всё равно удаляет собственный file', async () => {
  const wait = exportDeferred<void>(); (Sharing.shareAsync as jest.Mock).mockReturnValueOnce(wait.promise); let current = true
  const run = shareExportCsv('events', 'CSV', () => current); await flushExport(); current = false; wait.resolve(); await run; expect(mockFiles.size).toBe(0)
})
