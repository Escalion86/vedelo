import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, Linking, StyleSheet } from 'react-native'
import { EntityDocumentsScreen } from './EntityDocumentsScreen'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'

let mockId = 'a'.repeat(24)
let mockEntity: any
let mockLocalFiles: any[]
let mockRemote: any
const mockGetEntity = jest.fn()
const mockList = jest.fn()
const mockGet = jest.fn()
const mockPost = jest.fn()
const mockDelete = jest.fn()
const mockUpsert = jest.fn()
const mockSave = jest.fn()
const mockPick = jest.fn()
const mockEncrypt = jest.fn()
const mockShare = jest.fn()
const mockDeleteLocal = jest.fn()
const mockRetry = jest.fn()
const mockSync = jest.fn()
const mockQuery = { invalidateQueries: jest.fn(async () => undefined) }
const template = { id: 't', name: 'Шаблон', type: 'contract', fileName: 'Договор.docx' }
const document = { id: 'd', type: 'contract', title: 'Очень длинное название договора без обрезки '.repeat(4), file: { storageKey: 'private', name: 'Длинный файл.docx' } }
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: mockId }), useFocusEffect: (fn: any) => require('react').useEffect(fn, [fn]) }))
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => mockQuery }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: any[]) => mockPick(...args) }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ labelCapitalized: 'Заказ' }) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args), post: (...args: any[]) => mockPost(...args), delete: (...args: any[]) => mockDelete(...args) } }))
jest.mock('../../shared/storage/cache', () => ({ getCachedEntity: (...args: any[]) => mockGetEntity(...args), upsertEntities: (...args: any[]) => mockUpsert(...args) }))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: (...args: any[]) => mockSave(...args) }))
jest.mock('../../shared/storage/encryptedFiles', () => ({ listEncryptedFiles: (...args: any[]) => mockList(...args), encryptAndQueueFile: (...args: any[]) => mockEncrypt(...args), deleteEncryptedFile: (...args: any[]) => mockDeleteLocal(...args), retryFileQueueNow: (...args: any[]) => mockRetry(...args) }))
jest.mock('../../shared/sync/syncEngine', () => ({ runSync: (...args: any[]) => mockSync(...args) }))
jest.mock('./nativeFiles', () => ({ shareEncryptedFile: (...args: any[]) => mockShare(...args) }))
const draw = (kind: 'events' | 'clients' = 'events', mode: 'light' | 'dark' = 'light') => render(<ThemeProvider storage={null} forcedMode={mode}><EntityDocumentsScreen kind={kind} /></ThemeProvider>)
const localFile = (status = 'pending') => ({ id: 'f', localUri: 'encrypted://a', name: `Файл ${status}`, size: 80, mimeType: 'text/plain', status, entityType: 'events', entityId: mockId, lastError: 'secret signed-url raw-error' })
beforeEach(() => {
  jest.clearAllMocks(); mockId = 'a'.repeat(24)
  mockEntity = { _id: mockId, status: 'active', eventType: 'Съёмка', documents: [document], legacy: 'keep' }
  mockRemote = { ...mockEntity }; mockLocalFiles = []
  mockGetEntity.mockImplementation(async () => mockEntity)
  mockList.mockImplementation(async () => mockLocalFiles)
  mockGet.mockImplementation(async (path: string) => path === '/mobile/v1/document-templates' ? { success: true, data: [template] } : { success: true, data: mockRemote })
  mockUpsert.mockImplementation(async (_kind: string, items: any[]) => { mockEntity = items[0] })
  mockSave.mockImplementation(async ({ values }: any) => { mockEntity = { ...mockEntity, ...values, syncStatus: 'pending' }; return mockEntity })
  mockPick.mockResolvedValue({ canceled: true }); mockSync.mockResolvedValue(undefined); mockShare.mockResolvedValue(undefined)
})
it.each(['light', 'dark'] as const)('X: %s, длинные имена, документы и все реальные фазы очереди', async (mode) => {
  mockLocalFiles = ['pending', 'uploading', 'failed', 'synced'].map((status, index) => ({ ...localFile(status), id: String(index) }))
  const screen = draw('events', mode)
  await screen.findByText(document.title)
  expect(StyleSheet.flatten(screen.getByText(document.title).props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  for (const label of ['Ожидает отправки', 'Отправляется', 'Ошибка отправки', 'Синхронизирован']) expect(screen.getByText(label)).toBeTruthy()
  expect(screen.queryByText('secret signed-url raw-error')).toBeNull()
  expect(screen.getByText('Документы · 1')).toBeTruthy()
  expect(screen.getByText('Локальные копии и очередь · 4')).toBeTruthy()
})
it('X: missing/error не показывают пустой редактируемый экран; чтение повторяется', async () => {
  mockGetEntity.mockRejectedValueOnce(new Error('raw secret'))
  const screen = draw('clients')
  await screen.findByText('Не удалось прочитать документы. Повторите чтение.')
  expect(screen.queryByTestId('add-client-attachment')).toBeNull()
  mockEntity = null
  fireEvent.press(screen.getByText('Повторить чтение'))
  await screen.findByText('Клиент не найден')
  expect(screen.queryByText('Документов пока нет')).toBeNull()
})
it('X: ошибки шаблонов/локальных файлов независимы от документов сущности', async () => {
  mockGet.mockRejectedValueOnce(Object.assign(new Error('secret'), { status: 403 }))
  mockLocalFiles = [localFile()]
  const screen = draw()
  await screen.findByText(document.title)
  await screen.findByText('Нет доступа к документу или функция недоступна на текущем тарифе.')
  expect(screen.getByText('Файл pending')).toBeTruthy()
  fireEvent.press(screen.getByText('Повторить чтение шаблонов'))
  await screen.findByRole('radio', { name: 'Шаблон' })
  mockList.mockRejectedValueOnce(new Error('SQLCipher raw'))
  fireEvent.press(screen.getByText('Повторить чтение'))
  await screen.findByText('Не удалось прочитать локальные файлы.')
  expect(screen.getByText(document.title)).toBeTruthy()
})
it('X: поздний ответ старого route не заменяет новую сущность', async () => {
  let resolve!: (value: any) => void
  mockGetEntity.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const screen = draw('clients')
  mockId = 'b'.repeat(24); mockEntity = { _id: mockId, firstName: 'Новая', documents: [] }
  screen.rerender(<ThemeProvider storage={null} forcedMode="light"><EntityDocumentsScreen kind="clients" /></ThemeProvider>)
  await screen.findByText('Новая')
  await act(async () => resolve({ _id: 'a'.repeat(24), firstName: 'Старая', documents: [document] }))
  expect(screen.queryByText('Старая')).toBeNull(); expect(screen.queryByText(document.title)).toBeNull()
})
it('X: несовпадающий entity._id не даёт открыть/загрузить файл', async () => {
  mockEntity._id = 'foreign'
  const screen = draw()
  await screen.findByText('Не удалось прочитать документы. Повторите чтение.')
  expect(screen.queryByTestId('add-event-attachment')).toBeNull(); expect(mockPost).not.toHaveBeenCalled()
})
it('X: удалённый из текущего кэша документ не даёт access-url', async () => {
  const screen = draw(); await screen.findByText(document.title)
  mockEntity.documents = []
  fireEvent.press(screen.getByText(document.title))
  await screen.findByText('Не удалось открыть документ. Проверьте доступ и повторите чтение.')
  expect(mockPost).not.toHaveBeenCalled()
})
it.each([false, 'foreign'])('X: invalid access-url response %s не открывает native URL', async (value) => {
  const link = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
  mockPost.mockResolvedValueOnce({ success: value, data: { url: 'https://signed.invalid/secret' } })
  const screen = draw(); await screen.findByText(document.title)
  fireEvent.press(screen.getByText(document.title))
  await screen.findByText('Не удалось открыть документ. Проверьте доступ и повторите чтение.')
  expect(link).not.toHaveBeenCalled(); expect(mockUpsert).not.toHaveBeenCalled(); link.mockRestore()
})
it('X: 403 access/delete безопасны и не пишут кэш', async () => {
  mockPost.mockRejectedValueOnce(Object.assign(new Error('secret URL'), { status: 403 }))
  const screen = draw(); await screen.findByText(document.title)
  fireEvent.press(screen.getByText(document.title))
  await screen.findByText('Нет доступа к документу или функция недоступна на текущем тарифе.')
  const alert = jest.spyOn(Alert, 'alert')
  mockDelete.mockRejectedValueOnce(Object.assign(new Error('secret'), { status: 403 }))
  fireEvent.press(screen.getByTestId('remove-document-d'))
  await act(async () => alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  expect(mockUpsert).not.toHaveBeenCalled(); expect(screen.getByText(document.title)).toBeTruthy(); alert.mockRestore()
})
it('X: picker отменён, слишком большой файл и guard повторного picker', async () => {
  let resolve!: (value: any) => void
  mockPick.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const screen = draw(); await screen.findByText(document.title)
  fireEvent.press(screen.getByTestId('add-event-attachment')); fireEvent.press(screen.getByTestId('add-event-attachment'))
  await waitFor(() => expect(mockPick).toHaveBeenCalledTimes(1))
  await act(async () => resolve({ canceled: true }))
  expect(mockEncrypt).not.toHaveBeenCalled()
  mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'cache', name: 'a.pdf', size: 5 * 1024 * 1024 + 1 }] })
  fireEvent.press(screen.getByTestId('add-event-attachment'))
  await screen.findByText('Размер файла не должен превышать 5 МБ'); expect(mockEncrypt).not.toHaveBeenCalled()
})
it('X: upload только через шифрованную очередь, failed повторяется точным ID', async () => {
  mockEntity.documents = []; mockRemote.documents = []
  mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'cache', name: 'a.pdf', size: 10, mimeType: 'application/pdf' }] })
  mockEncrypt.mockImplementationOnce(async () => { mockLocalFiles = [localFile('failed')] })
  const screen = draw(); await screen.findByText('Документов пока нет')
  fireEvent.press(screen.getByTestId('add-event-attachment'))
  await screen.findByText('Ошибка отправки')
  expect(mockEncrypt).toHaveBeenCalledWith({ uri: 'cache', name: 'a.pdf', size: 10, mimeType: 'application/pdf', entityType: 'events', entityId: mockId, attachmentKind: 'entityDocument' })
  mockSync.mockImplementationOnce(async () => { mockLocalFiles = [{ ...localFile('synced') }] })
  fireEvent.press(screen.getByTestId('retry-event-attachments'))
  await screen.findByText('Синхронизирован')
  expect(mockRetry).toHaveBeenCalledWith({ id: 'f', entityType: 'events', entityId: mockId })
})
it('X: подменённые file entityType/entityId не показываются и устаревший file ID не decrypt', async () => {
  const file = localFile(); mockLocalFiles = [file, { ...file, id: 'foreign', name: 'Чужой', entityType: 'clients' }]
  const screen = draw(); await screen.findByText(file.name)
  expect(screen.queryByText('Чужой')).toBeNull()
  mockLocalFiles = [{ ...file, entityId: 'foreign' }]
  fireEvent.press(screen.getByText(file.name))
  await screen.findByText('Не удалось открыть локальную копию вложения.')
  expect(mockShare).not.toHaveBeenCalled()
})
it('X: локальная копия удаляется отдельно и отмена сохраняет очередь', async () => {
  mockLocalFiles = [localFile('synced')]
  const alert = jest.spyOn(Alert, 'alert')
  const screen = draw(); await screen.findByText('Файл synced')
  fireEvent.press(screen.getByLabelText('Удалить локальную копию Файл synced'))
  expect(alert.mock.calls[0][1]).toContain('на сервере останутся')
  act(() => alert.mock.calls[0][2]?.find((item) => item.style === 'cancel')?.onPress?.())
  expect(mockDeleteLocal).not.toHaveBeenCalled()
  fireEvent.press(screen.getByLabelText('Удалить локальную копию Файл synced'))
  mockDeleteLocal.mockImplementationOnce(async () => { mockLocalFiles = [] })
  await act(async () => alert.mock.calls[1][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  expect(mockDeleteLocal).toHaveBeenCalledWith('f'); expect(mockDelete).not.toHaveBeenCalled(); expect(mockEntity.documents).toHaveLength(1); alert.mockRestore()
})
it('X: private delete проверяет read-back до кэша и подтверждения', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  const screen = draw(); await screen.findByText(document.title)
  let finish!: (value: any) => void
  mockDelete.mockResolvedValueOnce({ success: true, data: { entity: { ...mockEntity, documents: [] } } })
  mockGet.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  fireEvent.press(screen.getByTestId('remove-document-d')); fireEvent.press(screen.getByTestId('remove-document-d'))
  expect(alert).toHaveBeenCalledTimes(1)
  act(() => { const confirm = alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress; confirm?.(); confirm?.() })
  await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1))
  expect(mockUpsert).not.toHaveBeenCalled()
  await act(async () => finish({ success: true, data: { ...mockEntity, documents: [] } }))
  await screen.findByText('Удаление документа подтверждено сервером')
  expect(mockUpsert).toHaveBeenCalledTimes(1); expect(mockEntity.legacy).toBe('keep'); alert.mockRestore()
})
it('X: чужой ID delete response не попадает в кэш и не объявляется успехом', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  mockDelete.mockResolvedValueOnce({ success: true, data: { entity: { _id: 'foreign', documents: [] } } })
  const screen = draw(); await screen.findByText(document.title)
  fireEvent.press(screen.getByTestId('remove-document-d'))
  await act(async () => alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  expect(mockUpsert).not.toHaveBeenCalled(); expect(screen.queryByText('Удаление документа подтверждено сервером')).toBeNull(); alert.mockRestore()
})
it('X: legacy снимается patch с сохранением canonical и соседних полей', async () => {
  mockEntity.documentFiles = [{ url: 'https://example.invalid/legacy', name: 'Фото' }, { url: 'https://example.invalid/keep', name: 'Оставить' }]
  const alert = jest.spyOn(Alert, 'alert')
  const screen = draw(); await screen.findByText('Фото')
  fireEvent.press(screen.getByTestId('remove-document-legacy:https://example.invalid/legacy'))
  expect(alert.mock.calls[0][1]).toContain('Файл по прежней ссылке останется')
  await act(async () => alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  expect(mockSave.mock.calls[0][0].values).toEqual({ documents: [document], documentFiles: [{ url: 'https://example.invalid/keep', name: 'Оставить' }] })
  expect(mockEntity.legacy).toBe('keep'); expect(mockDelete).not.toHaveBeenCalled(); alert.mockRestore()
})
it.each(['draft', 'local'])('X: generation %s запрещена и не вызывает POST', async (variant) => {
  if (variant === 'draft') mockEntity.status = 'draft'
  else { mockId = 'local-a'; mockEntity._id = mockId }
  const screen = draw(); await screen.findByRole('radio', { name: 'Шаблон' })
  fireEvent.press(screen.getByTestId('generate-document'))
  expect(mockPost).not.toHaveBeenCalled()
})
it('X: generation дата, guard, POST и фактический read-back согласованы', async () => {
  const screen = draw(); await screen.findByRole('radio', { name: 'Шаблон' })
  fireEvent.changeText(screen.getByTestId('document-date'), '2026-02-31')
  fireEvent.press(screen.getByTestId('generate-document'))
  await screen.findByText('Введите корректную дату в формате ГГГГ-ММ-ДД'); expect(mockPost).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByTestId('document-date'), '2026-10-03')
  let finish!: (value: any) => void
  mockPost.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  fireEvent.press(screen.getByTestId('generate-document')); fireEvent.press(screen.getByTestId('generate-document'))
  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
  const generated = { id: 'new', type: 'act', title: 'Новый акт', file: { storageKey: 'private-new' } }
  mockRemote = { ...mockEntity, documents: [document, generated] }
  await act(async () => finish({ success: true, data: { document: generated, event: mockRemote } }))
  await screen.findByText('Документ сформирован и прочитан с сервера')
  expect(mockPost).toHaveBeenCalledWith(`/mobile/v1/events/${mockId}/documents/generate`, { templateId: 't', documentDate: '2026-10-03' })
  expect(mockGet).toHaveBeenCalledWith(`/mobile/v1/events/${mockId}`)
  expect(mockUpsert).toHaveBeenCalledTimes(1)
})
it('X: неоднозначный generation failure допускает только GET проверки, без повторного POST', async () => {
  mockPost.mockRejectedValueOnce(new Error('network secret'))
  const screen = draw(); await screen.findByRole('radio', { name: 'Шаблон' })
  fireEvent.press(screen.getByTestId('generate-document'))
  await screen.findByText('Результат создания не подтверждён. Проверьте документы; повторный запрос может создать дубликат.')
  expect(screen.queryByTestId('generate-document')).toBeNull()
  fireEvent.press(screen.getByText('Проверить результат создания'))
  await screen.findByText('Новый документ пока не найден. Проверьте позднее; автоматического повторного создания нет.')
  expect(mockPost).toHaveBeenCalledTimes(1)
})
it('X: generation неверный eventId/templateId или success не подтверждается', async () => {
  const screen = draw(); await screen.findByRole('radio', { name: 'Шаблон' })
  mockGet.mockResolvedValueOnce({ success: true, data: [] })
  fireEvent.press(screen.getByTestId('generate-document'))
  await screen.findByText('Результат создания не подтверждён. Проверьте документы; повторный запрос может создать дубликат.')
  expect(mockPost).not.toHaveBeenCalled()
  mockPost.mockResolvedValueOnce({ success: true, data: { document: { id: 'new' }, event: { _id: 'foreign', documents: [] } } })
  fireEvent.press(screen.getByTestId('generate-document'))
  await screen.findByText('Проверить результат создания')
  expect(mockUpsert).not.toHaveBeenCalled()
})
it('X: 403 генерации не подтверждает успех и позволяет исправить доступ', async () => {
  mockPost.mockRejectedValueOnce(Object.assign(new Error('raw secret'), { status: 403 }))
  const screen = draw(); await screen.findByRole('radio', { name: 'Шаблон' })
  fireEvent.press(screen.getByTestId('generate-document'))
  await screen.findByText('Нет доступа к документу или функция недоступна на текущем тарифе.')
  expect(screen.getByTestId('generate-document')).toBeTruthy(); expect(mockUpsert).not.toHaveBeenCalled()
})
it('X: local event может положить файл в существующую очередь, generation остаётся недоступной', async () => {
  mockId = 'local-event'; mockEntity = { _id: mockId, status: 'draft', documents: [] }
  mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'cache', name: 'a.pdf', size: 10 }] })
  const screen = draw(); await screen.findByTestId('add-event-attachment')
  fireEvent.press(screen.getByTestId('add-event-attachment'))
  await waitFor(() => expect(mockEncrypt).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'local-event', entityType: 'events', attachmentKind: 'entityDocument' })))
  expect(mockPost).not.toHaveBeenCalled()
})
it('X: поздний generation ответ после unmount не пишет кэш', async () => {
  let finish!: (value: any) => void
  mockPost.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const screen = draw(); await screen.findByRole('radio', { name: 'Шаблон' })
  fireEvent.press(screen.getByTestId('generate-document'))
  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
  screen.unmount()
  await act(async () => finish({ success: true, data: { document: { id: 'new' }, event: { ...mockEntity, documents: [document, { id: 'new', type: 'other' }] } } }))
  expect(mockUpsert).not.toHaveBeenCalled()
})
it('X: неизвестный результат POST не подтверждается только наличием нового документа', async () => {
  mockPost.mockRejectedValueOnce(new Error('network'))
  const screen = draw(); await screen.findByRole('radio', { name: 'Шаблон' })
  fireEvent.press(screen.getByTestId('generate-document'))
  await screen.findByText('Проверить результат создания')
  mockRemote = { ...mockEntity, documents: [document, { id: 'other-device', type: 'other' }] }
  fireEvent.press(screen.getByText('Проверить результат создания'))
  await screen.findByText('Список обновлён. После потери ответа нельзя однозначно подтвердить создание. Проверьте новые документы перед повторным созданием.')
  expect(screen.queryByText('Документ сформирован и прочитан с сервера')).toBeNull(); expect(mockPost).toHaveBeenCalledTimes(1)
})
it('X: старое подтверждение удаления после смены route не отправляет DELETE', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  const screen = draw(); await screen.findByText(document.title)
  fireEvent.press(screen.getByTestId('remove-document-d'))
  const confirm = alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress
  mockId = 'b'.repeat(24); mockEntity = { _id: mockId, status: 'active', documents: [] }
  screen.rerender(<ThemeProvider storage={null} forcedMode="light"><EntityDocumentsScreen kind="events" /></ThemeProvider>)
  await screen.findByText('Документов пока нет')
  await act(async () => confirm?.())
  expect(mockDelete).not.toHaveBeenCalled(); alert.mockRestore()
})
