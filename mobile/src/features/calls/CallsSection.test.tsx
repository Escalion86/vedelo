import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { CallsSection } from './CallsSection'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
const mockGet = jest.fn(); const mockList = jest.fn(); const mockPush = jest.fn()
let mockFocus = 0
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('expo-router', () => ({ router: { push: (...args: any[]) => mockPush(...args) }, useFocusEffect: (fn: any) => require('react').useEffect(fn, [fn, mockFocus]) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args) } }))
jest.mock('../../shared/storage/cache', () => ({ listCachedEntities: (...args: any[]) => mockList(...args) }))
const call = { _id: '111111111111111111111111', status: 'new', direction: 'incoming', phone: '+79991112233', startedAt: '2026-10-03T03:00:00Z', durationSec: 75, aiSummary: 'Длинное описание '.repeat(50), aiExtractedFields: { clientName: 'Имя '.repeat(70) } }
const draw = (mode: 'light' | 'dark' = 'light') => <ThemeProvider storage={null} forcedMode={mode}><CallsSection /></ThemeProvider>
beforeEach(() => { jest.clearAllMocks(); mockFocus = 0; mockGet.mockResolvedValue({ success: true, data: [call] }); mockList.mockResolvedValue([]) })
it.each(['light', 'dark'] as const)('Y: calls %s, компактная строка, длинное имя, направления/длительность', async (mode) => {
  const screen = render(draw(mode)); await screen.findByText(call.aiExtractedFields.clientName)
  expect(StyleSheet.flatten(screen.getByText(call.aiExtractedFields.clientName).props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  expect(screen.getByText('1 мин 15 сек')).toBeTruthy()
  fireEvent.press(screen.getByLabelText(`Открыть звонок ${call.phone}`)); expect(mockPush).toHaveBeenCalledWith(`/calls/${call._id}`)
})
it('Y: initial loading не empty, read error не empty, retry даёт истинное пусто', async () => {
  let finish!: (value: any) => void; mockGet.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const screen = render(draw()); expect(screen.getByText('Загружаем звонки…')).toBeTruthy(); expect(screen.queryByText('Нет звонков')).toBeNull()
  await act(async () => finish({ success: false, data: [] }))
  await screen.findByText('Не удалось загрузить звонки. Повторите чтение.'); expect(screen.queryByText('Нет звонков')).toBeNull()
  mockGet.mockResolvedValue({ success: true, data: [] }); fireEvent.press(screen.getByText('Повторить чтение звонков')); await screen.findByText('Нет звонков')
})
it('Y: cache failure отдельно; фильтр читает endpoint, focus reload', async () => {
  mockList.mockRejectedValueOnce(new Error('raw-secret'))
  const screen = render(draw()); await screen.findByText(call.aiSummary)
  await screen.findByText('Не удалось прочитать клиентов. Журнал звонков доступен без их имён.')
  fireEvent.press(screen.getByText('Готовые')); await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/mobile/v1/calls?limit=80&status=ready'))
  await screen.findByText(call.aiSummary); mockFocus += 1; screen.rerender(draw()); await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(3))
})
it('Y: guard повторного чтения, late response unmount игнорируется', async () => {
  const screen = render(draw()); await screen.findByText(call.aiSummary)
  let finish!: (value: any) => void; mockGet.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  fireEvent.press(screen.getByText('Обновить звонки')); fireEvent.press(screen.getByText('Обновить звонки'))
  expect(mockGet).toHaveBeenCalledTimes(2); screen.unmount(); await act(async () => finish({ success: true, data: [call] })); expect(mockPush).not.toHaveBeenCalled()
})
