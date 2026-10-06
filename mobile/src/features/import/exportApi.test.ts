import fs from 'node:fs'
import path from 'node:path'
import { api } from '../../shared/api/client'
import { loadExportData } from './exportApi'
import { exportFixture, exportDeferred } from './exportFixtures'
jest.mock('../../shared/api/client', () => ({ api: { get: jest.fn() } }))
const get = api.get as jest.Mock
const gate = { success: true, data: { filters: { year: null, town: '', status: 'all' } } }
const fixture = () => get.mockImplementation((url: string) => Promise.resolve(url === '/mobile/v1/statistics' ? gate : { success: true, data: exportFixture()[url.split('/').at(-1) as keyof ReturnType<typeof exportFixture>] }))
beforeEach(() => { jest.resetAllMocks(); fixture() })
it('тарифный gate + четыре полные коллекции; без фильтров/локального cache', async () => {
  const signal = new AbortController().signal
  expect(await loadExportData(signal, () => true)).toEqual(exportFixture())
  expect(get.mock.calls.map(([url]) => url)).toEqual(['/mobile/v1/statistics', '/mobile/v1/events', '/mobile/v1/clients', '/mobile/v1/services', '/mobile/v1/transactions'])
  expect(get.mock.calls.every(([url, options]) => !url.includes('?') && options.signal === signal)).toBe(true)
})
it.each([401, 403, 500])('gate %s прекращает чтение коллекций', async status => {
  get.mockRejectedValue({ status }); await expect(loadExportData(new AbortController().signal, () => true)).rejects.toEqual({ status }); expect(get).toHaveBeenCalledTimes(1)
})
it.each([{ hasMore: true }, { totalCount: 99 }])('частичная meta %p отклоняется', async meta => {
  get.mockImplementation((url: string) => Promise.resolve(url === '/mobile/v1/statistics' ? gate : { success: true, data: [], meta }))
  await expect(loadExportData(new AbortController().signal, () => true)).rejects.toThrow()
})
it('дубликаты ID, malformed и success=false не экспортируются', async () => {
  for (const data of [[{ _id: 'x' }, { _id: 'x' }], [{ _id: null }], undefined]) {
    get.mockImplementation((url: string) => Promise.resolve(url === '/mobile/v1/statistics' ? gate : { success: true, data }))
    await expect(loadExportData(new AbortController().signal, () => true)).rejects.toThrow()
  }
  get.mockResolvedValue({ success: false }); await expect(loadExportData(new AbortController().signal, () => true)).rejects.toThrow()
})
it('gate с фильтрами не выдаётся за все данные', async () => {
  get.mockResolvedValue({ success: true, data: { filters: { year: 2026, town: 'Москва', status: 'all' } } })
  await expect(loadExportData(new AbortController().signal, () => true)).rejects.toThrow(); expect(get).toHaveBeenCalledTimes(1)
})
it('late gate не начинает коллекции; late collection не возвращает прежний tenant', async () => {
  let current = true; const wait = exportDeferred<unknown>(); get.mockReturnValueOnce(wait.promise)
  const loading = loadExportData(new AbortController().signal, () => current); current = false; wait.resolve(gate)
  await expect(loading).rejects.toThrow('STALE'); expect(get).toHaveBeenCalledTimes(1)
  current = true; fixture(); const rows = exportDeferred<unknown>(); get.mockImplementation((url: string) => url === '/mobile/v1/statistics' ? Promise.resolve(gate) : rows.promise)
  const next = loadExportData(new AbortController().signal, () => current); await Promise.resolve(); current = false; rows.resolve({ success: true, data: [] })
  await expect(next).rejects.toThrow('STALE')
})
it('bearer delegates ведут к tenant-фильтрованным полным GET (код текущего repo)', () => {
  const root = path.resolve(__dirname, '../../../../')
  for (const entity of ['events', 'clients', 'services', 'transactions']) {
    const route = fs.readFileSync(path.join(root, `app/api/mobile/v1/${entity}/route.js`), 'utf8')
    expect(route).toContain(`../../../${entity}/route`)
    const getSource = fs.readFileSync(path.join(root, `app/api/${entity}/route.js`), 'utf8').split('export const POST')[0]
    expect(getSource).toContain('getRequestContext(req)'); expect(getSource).toMatch(/\{ tenantId \}/)
  }
  expect(fs.readFileSync(path.join(root, 'server/getRequestContext.js'), 'utf8')).toContain('getMobileUser(req)')
})
