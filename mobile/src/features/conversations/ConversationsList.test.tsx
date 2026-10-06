import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import Screen from '../../../app/conversations/index'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
const mockGet = jest.fn(); const mockPush = jest.fn()
let mockParams: any; let mockFocus = 0
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('expo-router', () => ({ router: { push: (...args: any[]) => mockPush(...args) }, useLocalSearchParams: () => mockParams, useFocusEffect: (fn: any) => require('react').useEffect(fn, [fn, mockFocus]) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args) } }))
const id = '111111111111111111111111'; const clientId = '222222222222222222222222'
const conversation = { _id: id, clientId, status: 'open', unreadCount: 3, clientName: 'Длинное имя '.repeat(60), lastMessageText: 'Слово'.repeat(300), lastMessageAt: '2026-10-03T03:00:00Z' }
const draw = (mode: 'light' | 'dark' = 'light') => <ThemeProvider storage={null} forcedMode={mode}><Screen /></ThemeProvider>
beforeEach(() => { jest.clearAllMocks(); mockParams = {}; mockFocus = 0; mockGet.mockImplementation(async (path: string) => ({ success: true, data: path.includes('avito') ? [conversation] : [] })) })
it.each(['light', 'dark'] as const)('Y: conversations %s, long data, unread from provider, correct route', async (mode) => {
  const screen = render(draw(mode)); await screen.findByText(conversation.clientName)
  expect(StyleSheet.flatten(screen.getByText(conversation.clientName).props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  expect(screen.getByText('Непрочитано: 3')).toBeTruthy()
  fireEvent.press(screen.getByText(conversation.clientName)); expect(mockPush).toHaveBeenCalledWith(`/conversations/avito/${id}`)
})
it('Y: partial provider failure не маскируется успешным пустым ответом', async () => {
  mockGet.mockImplementation(async (path: string) => { if (path.includes('vk')) throw Object.assign(new Error('raw secret'), { status: 403 }); return { success: true, data: [] } })
  const screen = render(draw()); expect(screen.queryByText('Диалогов нет')).toBeNull()
  await screen.findByText('VK: Нет доступа или функция недоступна на текущем тарифе.'); expect(screen.getByText('Avito: диалогов нет.')).toBeTruthy(); expect(screen.queryByText('Диалогов нет')).toBeNull()
  mockGet.mockResolvedValue({ success: true, data: [] }); fireEvent.press(screen.getByText('Обновить диалоги')); await screen.findByText('Диалогов нет')
})
it('Y: success:false отдельно от пусто, focus reload', async () => {
  mockGet.mockResolvedValue({ success: false, data: [] }); const screen = render(draw())
  await screen.findByText('Avito: Не удалось загрузить диалоги. Повторите чтение.'); expect(screen.queryByText('Диалогов нет')).toBeNull()
  mockGet.mockResolvedValue({ success: true, data: [] }); mockFocus += 1; screen.rerender(draw()); await screen.findByText('Диалогов нет'); expect(mockGet).toHaveBeenCalledTimes(4)
})
it('Y: invalid/local scope не превращается в все диалоги', async () => {
  mockParams = { clientId: 'local-client' }; const screen = render(draw())
  await screen.findByText('Некорректный ID клиента или работы. Для локальной записи переписки доступны после синхронизации.'); expect(mockGet).not.toHaveBeenCalled()
})
it('Y: смена scope не оставляет старый список, late response/unmount игнорируется', async () => {
  mockParams = { clientId }; const screen = render(draw()); await screen.findByText(conversation.clientName)
  let finish!: (value: any) => void
  mockGet.mockImplementation((path: string) => path.includes('avito') ? new Promise((resolve) => { finish = resolve }) : Promise.resolve({ success: true, data: [] }))
  mockParams = { eventId: '333333333333333333333333' }; screen.rerender(draw())
  expect(screen.queryByText(conversation.clientName)).toBeNull(); expect(screen.queryByText('Диалогов нет')).toBeNull()
  screen.unmount(); await act(async () => finish({ success: true, data: [conversation] })); expect(mockPush).not.toHaveBeenCalled()
})
it('Y: wrong clientId ответа не принимается за историю выбранного клиента', async () => {
  mockParams = { clientId: '333333333333333333333333' }; const screen = render(draw())
  await screen.findByText('Avito: Не удалось загрузить диалоги. Повторите чтение.'); expect(screen.queryByText(conversation.clientName)).toBeNull()
})
