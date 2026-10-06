import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { DocumentsSection } from './DocumentsSection'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
let mockFiles: any[]
const mockList = jest.fn()
const mockGet = jest.fn()
const mockPick = jest.fn()
const mockEncrypt = jest.fn()
const mockShare = jest.fn()
const mockDownload = jest.fn()
const mockPush = jest.fn()
const mockRetry = jest.fn()
const mockSync = jest.fn()
const template = { id: 't', name: 'Длинное название шаблона '.repeat(7), fileName: 'Длинное имя файла.docx', type: 'other', customTypeName: 'Смета' }
const file = { id: 'f', localUri: 'encrypted', name: 'Локальный файл', mimeType: 'application/pdf', size: 50, status: 'failed', entityType: 'clients', entityId: 'c', lastError: 'raw-secret-signed-url' }
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('expo-router', () => ({ router: { push: (...args: any[]) => mockPush(...args) }, useFocusEffect: (fn: any) => require('react').useEffect(fn, [fn]) }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: any[]) => mockPick(...args) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args) } }))
jest.mock('../../shared/storage/cache', () => ({ getCachedEntity: async (_kind: string, id: string) => ({ _id: id }) }))
jest.mock('../../shared/storage/encryptedFiles', () => ({ listEncryptedFiles: () => mockList(), encryptAndQueueFile: (...args: any[]) => mockEncrypt(...args), retryFileQueueNow: (...args: any[]) => mockRetry(...args), deleteEncryptedFile: jest.fn() }))
jest.mock('../../shared/sync/syncEngine', () => ({ runSync: (...args: any[]) => mockSync(...args) }))
jest.mock('./nativeFiles', () => ({ shareEncryptedFile: (...args: any[]) => mockShare(...args), downloadAndShareTemplate: (...args: any[]) => mockDownload(...args) }))
const draw = (mode: 'light' | 'dark' = 'light') => render(<ThemeProvider storage={null} forcedMode={mode}><DocumentsSection /></ThemeProvider>)
beforeEach(() => { jest.clearAllMocks(); mockFiles = [file]; mockList.mockImplementation(async () => mockFiles); mockGet.mockResolvedValue({ success: true, data: [template] }); mockPick.mockResolvedValue({ canceled: true }); mockSync.mockResolvedValue(undefined) })
it.each(['light', 'dark'] as const)('X: Documents %s, счётчики/длинные имена/темы без raw lastError', async (mode) => {
  const screen = draw(mode); await screen.findByText(template.name)
  expect(StyleSheet.flatten(screen.getByText(template.name).props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  expect(screen.getByText('Шаблоны документов · 1')).toBeTruthy(); expect(screen.getByText('Локальные файлы · 1')).toBeTruthy()
  expect(screen.queryByText(file.lastError)).toBeNull()
  fireEvent.press(screen.getByText(template.name)); expect(mockPush).toHaveBeenCalledWith('/more/documents/template/t')
})
it('X: ошибка шаблонов не скрывает локальные вложения, ошибки/empty/retry различимы', async () => {
  mockGet.mockRejectedValueOnce(Object.assign(new Error('raw secret'), { status: 403 }))
  const screen = draw(); await screen.findByText('Локальный файл')
  await screen.findByText('Нет доступа к документу или функция недоступна на текущем тарифе.')
  expect(screen.queryByText('Шаблоны ещё не добавлены')).toBeNull()
  mockGet.mockResolvedValueOnce({ success: true, data: [] })
  fireEvent.press(screen.getByText('Повторить чтение шаблонов'))
  await screen.findByText('Шаблоны ещё не добавлены')
})
it('X: read failure файлов имеет retry, не выглядит успешным отсутствием', async () => {
  mockList.mockRejectedValueOnce(new Error('SQLCipher secret'))
  const screen = draw(); await screen.findByText('Не удалось прочитать локальные файлы.')
  expect(screen.queryByText('Локальных файлов пока нет')).toBeNull()
  fireEvent.press(screen.getByText('Повторить чтение файлов')); await screen.findByText('Локальный файл')
})
it('X: отмена picker ничего не пишет, failed очередь повторяется точным ID', async () => {
  const screen = draw(); await screen.findByText('Локальный файл')
  fireEvent.press(screen.getByText('Добавить вложение до 5 МБ'))
  await waitFor(() => expect(mockPick).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.queryByText('Выбираем и отправляем файл…')).toBeNull())
  expect(mockEncrypt).not.toHaveBeenCalled()
  mockSync.mockImplementationOnce(async () => { mockFiles = [{ ...file, status: 'synced' }] })
  fireEvent.press(screen.getByText('Повторить отправку'))
  await screen.findByText('Синхронизирован'); expect(mockRetry).toHaveBeenCalledWith({ id: 'f' })
})
it('X: устаревший локальный file ID не share, late download не проходит после unmount', async () => {
  const screen = draw(); await screen.findByText('Локальный файл')
  mockFiles = []
  fireEvent.press(screen.getByText('Локальный файл'))
  await screen.findByText('Не удалось открыть локальную копию файла.'); expect(mockShare).not.toHaveBeenCalled()
  let finish!: (value: any) => void
  mockGet.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  fireEvent.press(screen.getByLabelText(`Скачать и поделиться шаблоном ${template.name}`))
  screen.unmount()
  await act(async () => finish({ success: true, data: [template] }))
  expect(mockDownload).not.toHaveBeenCalled()
})
