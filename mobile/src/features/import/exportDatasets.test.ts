import fs from 'node:fs'
import path from 'node:path'
import { buildExportDatasets, exportCsv, exportDate, exportSchemas, unavailableColumns } from './exportDatasets'
import { exportFixture, exportTerms } from './exportFixtures'
import { resolveMobileWorkItemTerminology } from '../../shared/domain/workItemTerminology'

// Evaluate the actual repo web helpers with their real pure dependencies.
// No Next.js/browser install or copied expected implementation is needed.
const root = path.resolve(__dirname, '../../../../')
const source = (name: string) => fs.readFileSync(path.join(root, name), 'utf8')
const pure = (name: string, entry: string) => new Function(source(name).replace(/export default \w+\s*;?/g, '').replace(/export /g, '') + `\nreturn ${entry}`)()
const webBuild = new Function('formatAddress', 'getPersonFullName', 'resolveWorkItemTerminology', source('helpers/csvExport.js').replace(/^import .*$/gm, '').replace(/export /g, '') + '\nreturn buildExportDatasets')(
  pure('helpers/formatAddress.js', 'formatAddress'), pure('helpers/getPersonFullName.js', 'getPersonFullName'), pure('helpers/workItemTerminology.mjs', 'resolveWorkItemTerminology'))

it.each(['events', 'orders'] as const)('все заголовки/строки совпадают с текущим web (%s)', mode => {
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-03T00:00:00Z').getTime())
  const data = exportFixture(), siteSettings = { _id: 's', custom: { primaryEntityTerminology: mode } }
  expect(buildExportDatasets(data, resolveMobileWorkItemTerminology(siteSettings))).toEqual(webBuild({ ...data, siteSettings }))
  jest.restoreAllMocks()
})
it('финансы web включают обязательства, заявки отделены, orphan/unlinked не теряются', () => {
  const datasets = buildExportDatasets(exportFixture(), exportTerms, Date.parse('2026-10-03'))
  expect(datasets.events.rows.map(row => row.ID)).toEqual(['work', 'closed', 'canceled', 'future'])
  expect(datasets.requests.rows.map(row => row.ID)).toEqual(['request'])
  expect(datasets.events.rows[0]).toMatchObject({ Доход: 800.75, Расход: 200.25, Прибыль: 600.5, Клиент: 'Анна Иванова Петровна', Статус: 'Завершено' })
  expect(datasets.transactions.rows).toHaveLength(5)
  expect(datasets.transactions.rows[3]).toMatchObject({ Клиент: 'deleted', Заказ: '' })
})
it('absent vs explicit empty поля не получают выдуманные даты/телефон/услуги', () => {
  const data = exportFixture(); data.events[1] = { _id: 'request', status: 'draft' }
  const sets = buildExportDatasets(data, exportTerms)
  expect(sets.requests.rows[0]).toMatchObject({ 'Дата заявки': 'Недоступно', Телефон: 'Недоступно', Услуги: 'Недоступно', 'Дата заказа': '' })
  expect(unavailableColumns(sets, ['requests'])).toEqual(['Дата заявки', 'Телефон', 'Услуги'])
  data.events[1] = { _id: 'request', status: 'draft', createdAt: null, phone: null, servicesIds: [] }
  expect(unavailableColumns(buildExportDatasets(data, exportTerms), ['requests'])).toEqual([])
})
it('sanitized statistics не считается полноценной экспортной коллекцией', () => {
  const data = exportFixture(); delete data.events[1].createdAt; delete data.events[1].phone; delete data.clients[0].phone
  expect(buildExportDatasets(data, exportTerms).requests.rows[0].Телефон).toBe('Недоступно')
})
it('проекция отбрасывает неэкспортируемые свойства коллекции', () => {
  expect(exportSchemas.events.parse({ ...exportFixture().events[0], documents: ['PRIVATE'], tenantId: 'other', secret: 'SECRET' })).not.toHaveProperty('documents')
  expect(exportSchemas.clients.parse({ _id: 'c', refreshToken: 'SECRET', phone: null })).toEqual({ _id: 'c', phone: null })
})
it('CSV BOM/semicolon/quotes/multiline и числа сохраняются', () => {
  expect(exportCsv({ headers: ['Текст', 'Сумма', 'Пусто'], rows: [{ Текст: 'a;"b"\r\nc', Сумма: -12.75, Пусто: null }] })).toBe('\ufeffТекст;Сумма;Пусто\r\n"a;""b""\r\nc";-12.75;')
})
it.each(['=SUM(A1)', '+7999', '-cmd', '@value', ' \t=1', '\ufeff+1', '\u200b@x', '\r\n-1'])('защита формульной инъекции %p', value => {
  const csv = exportCsv({ headers: ['Cell'], rows: [{ Cell: value }] })
  expect(csv.split('\r\n')[1]).toMatch(/^"?'/)
})
it.each([NaN, Infinity, -Infinity])('невалидное число %p не записывается', value => expect(() => exportCsv({ headers: ['n'], rows: [{ n: value }] })).toThrow())
it('даты как web в локальном часовом поясе, неверная/пустая дата не выдумана', () => {
  expect(exportDate('2026-01-01T00:30:00Z')).toBe(new Date('2026-01-01T00:30:00Z').toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))
  expect(exportDate('bad')).toBe(''); expect(exportDate(null)).toBe('')
})
