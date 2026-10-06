import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, StyleSheet } from 'react-native'
import Editor from './DocumentTemplateEditor'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
let mockId = 't'
let mockTemplates: any[]
let mockPrevented: boolean
let mockOnRemove: (event: any) => void
const mockGet = jest.fn()
const mockUpload = jest.fn()
const mockDelete = jest.fn()
const mockPick = jest.fn()
const mockBack = jest.fn()
const mockDispatch = jest.fn()
const template = { id: 't', type: 'contract', name: 'Длинное название шаблона '.repeat(5), fileName: 'Длинное имя файла '.repeat(4) + '.docx' }
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('expo-router', () => ({ router: { back: () => mockBack() }, useNavigation: () => ({ dispatch: mockDispatch }), useLocalSearchParams: () => ({ id: mockId }) }))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: (prevent: boolean, fn: any) => { mockPrevented = prevent; mockOnRemove = fn } }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: any[]) => mockPick(...args) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args), upload: (...args: any[]) => mockUpload(...args), delete: (...args: any[]) => mockDelete(...args) } }))
const draw = (mode: 'light' | 'dark' = 'light') => render(<ThemeProvider storage={null} forcedMode={mode}><Editor /></ThemeProvider>)
beforeEach(() => {
  jest.clearAllMocks(); mockId = 't'; mockTemplates = [{ ...template }]
  mockGet.mockImplementation(async () => ({ success: true, data: mockTemplates }))
  mockPick.mockResolvedValue({ canceled: true })
})
it.each(['light', 'dark'] as const)('X: редактор %s, длинные имена и CompactField', async (mode) => {
  const screen = draw(mode); await screen.findByTestId('template-name')
  expect(screen.getByTestId('template-name').props.value).toBe(template.name)
  expect(StyleSheet.flatten(screen.getByTestId('template-name').props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  expect(screen.getByText(template.fileName)).toBeTruthy()
  expect(mockPrevented).toBe(false)
})
it.each([403, 404, 500])('X: read %s не открывает пустую форму; retry доступен', async (status) => {
  mockGet.mockRejectedValueOnce(Object.assign(new Error('raw secret'), { status }))
  const screen = draw()
  await screen.findByText('Повторить чтение')
  expect(screen.queryByTestId('template-name')).toBeNull(); expect(screen.queryByTestId('save-template')).toBeNull()
  fireEvent.press(screen.getByText('Повторить чтение')); await screen.findByTestId('template-name')
})
it('X: отсутствующий template и success:false не открывают форму', async () => {
  mockTemplates = []
  const screen = draw(); await screen.findByText('Шаблон не найден')
  expect(screen.queryByTestId('template-name')).toBeNull()
  mockGet.mockResolvedValueOnce({ success: false, data: [template] })
  fireEvent.press(screen.getByText('Повторить чтение')); await screen.findByText('Не удалось загрузить шаблон.')
})
it('X: поздний ответ старого route/unmount игнорируется', async () => {
  let finish!: (value: any) => void
  mockGet.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const screen = draw(); mockId = 'new'
  screen.rerender(<ThemeProvider storage={null} forcedMode="light"><Editor /></ThemeProvider>)
  await screen.findByTestId('template-name')
  fireEvent.changeText(screen.getByTestId('template-name'), 'Не перезаписать')
  await act(async () => finish({ success: true, data: [template] }))
  expect(screen.getByTestId('template-name').props.value).toBe('Не перезаписать')
})
it('X: picker cancel не меняет draft, guard не открывает два picker', async () => {
  let finish!: (value: any) => void
  mockPick.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const screen = draw(); await screen.findByTestId('template-name')
  fireEvent.press(screen.getByTestId('pick-template-file')); fireEvent.press(screen.getByTestId('pick-template-file'))
  await waitFor(() => expect(mockPick).toHaveBeenCalledTimes(1))
  await act(async () => finish({ canceled: true }))
  expect(mockPrevented).toBe(false); expect(screen.getByText(template.fileName)).toBeTruthy(); expect(mockUpload).not.toHaveBeenCalled()
})
it.each([{ name: 'a.pdf', size: 5, error: 'Выберите файл в формате DOCX' }, { name: 'a.docx', size: 5 * 1024 * 1024 + 1, error: 'Размер DOCX-шаблона не должен превышать 5 МБ' }])('X: невалидный picker $name/$size не записывает файл', async ({ name, size, error }) => {
  mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'cache', name, size }] })
  const screen = draw(); await screen.findByTestId('template-name')
  fireEvent.press(screen.getByTestId('pick-template-file')); await screen.findByText(error)
  expect(screen.getByText(template.fileName)).toBeTruthy(); expect(mockPrevented).toBe(false)
})
it('X: validation name/file и other customTypeName необязателен', async () => {
  mockId = 'new'
  const screen = draw(); await screen.findByTestId('template-name')
  fireEvent.press(screen.getByTestId('save-template')); await screen.findByText('Введите название шаблона')
  fireEvent.changeText(screen.getByTestId('template-name'), 'Другое')
  fireEvent.press(screen.getByTestId('save-template')); await screen.findByText('Выберите DOCX-файл')
  fireEvent.press(screen.getByRole('radio', { name: 'Другое' }))
  expect(screen.getByLabelText('Название типа').props.value).toBe('')
  expect(mockUpload).not.toHaveBeenCalled()
})
it('X: dirty Back подтверждается, во время операции выход блокирован', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  const screen = draw(); await screen.findByTestId('template-name')
  fireEvent.changeText(screen.getByTestId('template-name'), 'Правка')
  expect(mockPrevented).toBe(true)
  act(() => mockOnRemove({ data: { action: { type: 'BACK' } } }))
  expect(mockDispatch).not.toHaveBeenCalled()
  act(() => alert.mock.calls[0][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'BACK' })
  let finish!: (value: any) => void
  mockUpload.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  fireEvent.press(screen.getByTestId('save-template')); await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1))
  act(() => mockOnRemove({ data: { action: { type: 'BACK' } } }))
  expect(alert).toHaveBeenCalledTimes(1)
  mockTemplates = [{ ...template, name: 'Правка' }]
  await act(async () => finish({ success: true, data: mockTemplates[0] }))
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1)); alert.mockRestore()
})
it('X: save failure сохраняет ввод, guard не повторяет upload; read-back перед уходом', async () => {
  let reject!: (cause: Error) => void
  mockUpload.mockImplementationOnce(() => new Promise((_, failure) => { reject = failure }))
  const screen = draw(); await screen.findByTestId('template-name')
  fireEvent.changeText(screen.getByTestId('template-name'), 'Новый шаблон')
  fireEvent.press(screen.getByTestId('save-template')); fireEvent.press(screen.getByTestId('save-template'))
  await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1))
  await act(async () => reject(new Error('secret')))
  expect(screen.getByTestId('template-name').props.value).toBe('Новый шаблон'); expect(mockBack).not.toHaveBeenCalled()
  mockUpload.mockResolvedValueOnce({ success: true, data: { ...template, name: 'Новый шаблон' } })
  fireEvent.press(screen.getByTestId('save-template'))
  await screen.findByText('Проверить сохранение')
  expect(mockBack).not.toHaveBeenCalled()
  mockTemplates = [{ ...template, name: 'Новый шаблон' }]
  fireEvent.press(screen.getByText('Проверить сохранение'))
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1)); expect(mockUpload).toHaveBeenCalledTimes(2)
})
it('X: создание с DOCX проверяется отдельным GET, ID ответа не выдумывается', async () => {
  const append = jest.spyOn(FormData.prototype, 'append')
  mockId = 'new'; mockTemplates = []
  mockPick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'cache://picked', name: 'Новый.docx', size: 50 }] })
  const created = { id: 'created', name: 'Новый', type: 'contract', fileName: 'Новый.docx' }
  mockUpload.mockImplementationOnce(async () => { mockTemplates = [created]; return { success: true, data: created } })
  const screen = draw(); await screen.findByTestId('pick-template-file')
  fireEvent.press(screen.getByTestId('pick-template-file')); await screen.findByText('Новый.docx')
  fireEvent.press(screen.getByTestId('save-template')); await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
  expect(mockGet).toHaveBeenCalledWith('/mobile/v1/document-templates')
  expect(append).toHaveBeenCalledWith('file', expect.objectContaining({ uri: 'cache://picked', name: 'Новый.docx' }))
  append.mockRestore()
})
it('X: удаление подтверждается один раз, 403 оставляет ввод; read-back без повторного DELETE', async () => {
  const alert = jest.spyOn(Alert, 'alert')
  mockDelete.mockRejectedValueOnce(Object.assign(new Error('raw secret'), { status: 403 }))
  const screen = draw(); await screen.findByTestId('template-name')
  fireEvent.changeText(screen.getByTestId('template-name'), 'Не потерять')
  fireEvent.press(screen.getByTestId('delete-template')); fireEvent.press(screen.getByTestId('delete-template'))
  expect(alert).toHaveBeenCalledTimes(1)
  act(() => alert.mock.calls[0][2]?.find((item) => item.style === 'cancel')?.onPress?.())
  expect(mockDelete).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('delete-template'))
  await act(async () => alert.mock.calls[1][2]?.find((item) => item.style === 'destructive')?.onPress?.())
  expect(screen.getByTestId('template-name').props.value).toBe('Не потерять'); expect(mockBack).not.toHaveBeenCalled()
  mockDelete.mockResolvedValueOnce({ success: true, data: { id: 't' } })
  fireEvent.press(screen.getByTestId('delete-template'))
  act(() => { const confirm = alert.mock.calls[2][2]?.find((item) => item.style === 'destructive')?.onPress; confirm?.(); confirm?.() })
  await screen.findByText('Проверить удаление'); expect(mockBack).not.toHaveBeenCalled()
  mockTemplates = []; fireEvent.press(screen.getByText('Проверить удаление'))
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1)); expect(mockDelete).toHaveBeenCalledTimes(2); alert.mockRestore()
})
it('X: response save с чужим ID или success false не уводит со страницы', async () => {
  mockUpload.mockResolvedValueOnce({ success: true, data: { ...template, id: 'foreign', name: 'Правка' } })
  const screen = draw(); await screen.findByTestId('template-name')
  fireEvent.changeText(screen.getByTestId('template-name'), 'Правка'); fireEvent.press(screen.getByTestId('save-template'))
  await screen.findByText('Не удалось подтвердить сохранение. Ввод сохранён; проверьте список перед повторной загрузкой.')
  expect(mockBack).not.toHaveBeenCalled(); expect(screen.getByTestId('template-name').props.value).toBe('Правка')
})
