import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, Linking, StyleSheet } from 'react-native'
import Screen from '../../../app/conversations/[provider]/[id]'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
const mockGet = jest.fn(); const mockPost = jest.fn(); const mockPatch = jest.fn(); const mockList = jest.fn(); const mockCache = jest.fn(); const mockPush = jest.fn(); const mockDispatch = jest.fn()
let mockParams: any; let mockConversation: any; let mockMessages: any[]; let mockFocus = 0; let mockPrevented = false; let mockBack: any
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
jest.mock('expo-router', () => ({ router: { push: (...args: any[]) => mockPush(...args) }, useLocalSearchParams: () => mockParams, useFocusEffect: (fn: any) => require('react').useEffect(fn, [fn, mockFocus]), useNavigation: () => ({ dispatch: mockDispatch }) }))
jest.mock('@react-navigation/native', () => ({ usePreventRemove: (value: boolean, callback: any) => { mockPrevented = value; mockBack = callback } }))
jest.mock('../../shared/hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ labelCapitalized: 'Заказ' }) }))
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: any[]) => mockGet(...args), post: (...args: any[]) => mockPost(...args), patch: (...args: any[]) => mockPatch(...args) } }))
jest.mock('../../shared/storage/cache', () => ({ listCachedEntities: (...args: any[]) => mockList(...args), getCachedEntity: (...args: any[]) => mockCache(...args) }))
const id = '111111111111111111111111'; const otherId = '222222222222222222222222'; const messageId = '333333333333333333333333'
const incoming = { _id: otherId, direction: 'incoming', status: 'received', text: 'Длинноеслово'.repeat(80), sentAt: '2026-10-03T03:00:00Z' }
const sent = { _id: messageId, direction: 'outgoing', status: 'sent', text: 'Старый ответ', sentAt: '2026-10-03T04:00:00Z' }
const history = () => ({ success: true, data: { conversation: { ...mockConversation }, messages: [...mockMessages] } })
const draw = (mode: 'light' | 'dark' = 'light') => <ThemeProvider storage={null} forcedMode={mode}><Screen /></ThemeProvider>
const confirm = async () => { const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)[2]; await act(async () => buttons.find((button: any) => button.text === 'Подтвердить').onPress()) }
beforeEach(() => {
  jest.clearAllMocks(); mockFocus = 0; mockParams = { provider: 'avito', id }; mockConversation = { _id: id, status: 'open', unreadCount: 2, clientName: 'Имя '.repeat(40) }; mockMessages = [incoming]
  mockGet.mockImplementation(async () => history()); mockList.mockResolvedValue([]); mockCache.mockResolvedValue(null)
  mockPost.mockImplementation(async () => { mockMessages.push(sent); return { success: true, data: { message: sent } } })
  mockPatch.mockImplementation(async (_path: string, body: any) => { mockConversation = { ...mockConversation, ...(body.status ? { status: body.status } : {}), ...(body.markRead ? { unreadCount: 0 } : {}) }; return { success: true, data: mockConversation } })
  jest.spyOn(Alert, 'alert').mockImplementation(() => {}); jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
})
afterEach(() => jest.restoreAllMocks())
it.each(['light', 'dark'] as const)('Y: detail %s, текст/поле/направление и отправленный статус', async (mode) => {
  const screen = render(draw(mode)); await screen.findByText(incoming.text)
  expect(StyleSheet.flatten(screen.getByText(incoming.text).props.style).color).toBe((mode === 'dark' ? darkPalette : lightPalette).text)
  expect(screen.getByLabelText('Ответ клиенту').props.maxLength).toBe(4000)
  fireEvent.changeText(screen.getByLabelText('Ответ клиенту'), 'Старый ответ'); fireEvent.press(screen.getByText('Отправить'))
  await screen.findByText('Отправлено. Доставка клиенту не подтверждена.'); expect(screen.getByLabelText('Ответ клиенту').props.value).toBe('')
  expect(mockPost).toHaveBeenCalledWith(`/mobile/v1/conversations/avito/${id}/messages`, { text: 'Старый ответ' }, { skipRefresh: true })
  expect(mockGet).toHaveBeenCalledTimes(2); expect(mockPatch).not.toHaveBeenCalled()
})
it.each(['telegram', 'VK', '', 'vk/../avito'])('Y: invalid provider %p не вызывает API', async (provider) => {
  mockParams = { provider, id }; const screen = render(draw()); await screen.findByText('Некорректный канал или ID диалога.'); expect(mockGet).not.toHaveBeenCalled(); expect(screen.queryByLabelText('Ответ клиенту')).toBeNull()
})
it('Y: initial loading/нет messages не empty, wrong ID ответа и retry', async () => {
  let finish!: (value: any) => void; mockGet.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const screen = render(draw()); expect(screen.queryByText('Сообщений нет')).toBeNull(); expect(screen.queryByLabelText('Ответ клиенту')).toBeNull()
  await act(async () => finish({ success: true, data: { conversation: { ...mockConversation, _id: otherId }, messages: [incoming] } }))
  await screen.findByText('Не удалось загрузить переписку. Повторите чтение.'); expect(screen.queryByText(incoming.text)).toBeNull()
  mockMessages = []; fireEvent.press(screen.getByText('Повторить чтение переписки')); await screen.findByText('Сообщений нет')
})
it.each(['403', 'network', 'success:false', 'failed'])('Y: send %s сохраняет draft без успешного добавления', async (failure) => {
  mockPost.mockImplementationOnce(async () => { if (failure === '403') throw Object.assign(new Error('secret'), { status: 403 }); if (failure === 'network') throw new Error('raw URL'); return { success: failure !== 'success:false', data: { message: failure === 'failed' ? { ...sent, status: 'failed' } : sent } } })
  const screen = render(draw()); await screen.findByLabelText('Ответ клиенту'); fireEvent.changeText(screen.getByLabelText('Ответ клиенту'), 'Старый ответ'); fireEvent.press(screen.getByText('Отправить'))
  await screen.findByText(failure === '403' ? 'Нет доступа или функция недоступна на текущем тарифе.' : 'Отправка не подтверждена. Текст сохранён. Обновите историю перед повторной отправкой.')
  expect(screen.getByLabelText('Ответ клиенту').props.value).toBe('Старый ответ'); expect(screen.queryByText(sent.text)).toBeNull(); expect(mockPost).toHaveBeenCalledTimes(1); expect(mockGet).toHaveBeenCalledTimes(1)
})
it('Y: double send guard, новый draft во время старого POST/read-back не стирается', async () => {
  let finish!: (value: any) => void; mockPost.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const screen = render(draw()); await screen.findByLabelText('Ответ клиенту'); fireEvent.changeText(screen.getByLabelText('Ответ клиенту'), 'Старый ответ')
  fireEvent.press(screen.getByText('Отправить')); fireEvent.press(screen.getByText('Отправить')); expect(mockPost).toHaveBeenCalledTimes(1)
  fireEvent.changeText(screen.getByLabelText('Ответ клиенту'), 'Новый ответ'); mockMessages.push(sent)
  await act(async () => finish({ success: true, data: { message: sent } })); await screen.findByText('Отправлено. Доставка клиенту не подтверждена.'); expect(screen.getByLabelText('Ответ клиенту').props.value).toBe('Новый ответ')
})
it('Y: read-back exact ID, failed/missing не даёт success; retry лишь GET, draft живёт', async () => {
  mockPost.mockResolvedValueOnce({ success: true, data: { message: sent } })
  const screen = render(draw()); await screen.findByLabelText('Ответ клиенту'); fireEvent.changeText(screen.getByLabelText('Ответ клиенту'), 'Старый ответ'); fireEvent.press(screen.getByText('Отправить'))
  await screen.findByText('Отправка не подтверждена. Текст сохранён. Обновите историю перед повторной отправкой.'); expect(screen.queryByText('Отправлено. Доставка клиенту не подтверждена.')).toBeNull()
  mockMessages.push(sent); fireEvent.press(screen.getByText('Проверить действие по истории')); await screen.findByText('Отправлено. Доставка клиенту не подтверждена.'); expect(mockPost).toHaveBeenCalledTimes(1); expect(screen.getByLabelText('Ответ клиенту').props.value).toBe('')
})
it('Y: markRead failure явно виден, refresh сохраняет draft и не повторяет PATCH/POST', async () => {
  mockPatch.mockRejectedValueOnce(Object.assign(new Error('secret'), { status: 403 }))
  const screen = render(draw()); await screen.findByLabelText('Ответ клиенту'); fireEvent.changeText(screen.getByLabelText('Ответ клиенту'), 'Draft'); fireEvent.press(screen.getByText('Отметить прочитанным'))
  await screen.findByText('Нет доступа или функция недоступна на текущем тарифе.'); expect(screen.queryByText('Диалог отмечен прочитанным.')).toBeNull()
  fireEvent.press(screen.getByText('Повторить чтение переписки')); await screen.findByLabelText('Ответ клиенту'); expect(screen.getByLabelText('Ответ клиенту').props.value).toBe('Draft'); expect(mockPatch).toHaveBeenCalledTimes(1); expect(mockPost).not.toHaveBeenCalled()
})
it('Y: markRead/status успех только после read-back; возврат в работу', async () => {
  const screen = render(draw()); await screen.findByLabelText('Ответ клиенту'); fireEvent.press(screen.getByText('Отметить прочитанным')); await screen.findByText('Диалог отмечен прочитанным.')
  fireEvent.press(screen.getByText('Закрыть диалог')); expect(mockPatch).toHaveBeenCalledTimes(1); await confirm(); await screen.findByText('Статус диалога обновлён.'); expect(screen.getByText('Закрыт')).toBeTruthy()
  fireEvent.press(screen.getByText('Вернуть в работу')); await screen.findByText('В работе'); expect(mockPatch).toHaveBeenCalledTimes(3); expect(mockPost).not.toHaveBeenCalled()
})
it('Y: PATCH 200 success:false и неверный status read-back не объявляют успех', async () => {
  mockPatch.mockResolvedValueOnce({ success: false, data: mockConversation })
  const screen = render(draw()); await screen.findByLabelText('Ответ клиенту'); fireEvent.press(screen.getByText('Закрыть диалог')); await confirm()
  await screen.findByText('Не удалось подтвердить изменение диалога. Обновите историю или повторите проверку.'); expect(screen.queryByText('Статус диалога обновлён.')).toBeNull()
  mockPatch.mockResolvedValueOnce({ success: true, data: mockConversation }); fireEvent.press(screen.getByText('Закрыть диалог')); await confirm(); await screen.findByText('Проверить действие по истории'); expect(screen.queryByText('Закрыт')).toBeNull()
})
it('Y: route change/unmount/старый confirm не мутируют новый диалог', async () => {
  const screen = render(draw()); await screen.findByLabelText('Ответ клиенту'); fireEvent.changeText(screen.getByLabelText('Ответ клиенту'), 'Старый draft'); fireEvent.press(screen.getByText('Закрыть диалог'))
  const oldConfirm = (Alert.alert as jest.Mock).mock.calls.at(-1)[2][1].onPress
  mockParams = { provider: 'vk', id: otherId }; mockConversation = { ...mockConversation, _id: otherId, clientName: 'Новый клиент' }; mockMessages = []
  screen.rerender(draw()); expect(screen.queryByText(incoming.text)).toBeNull(); await screen.findByLabelText('Ответ клиенту'); expect(screen.getByLabelText('Ответ клиенту').props.value).toBe('')
  await act(async () => oldConfirm()); expect(mockPatch).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByLabelText('Ответ клиенту'), 'Новый draft'); let finish!: (value: any) => void; mockPost.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })); fireEvent.press(screen.getByText('Отправить')); screen.unmount(); const count = mockGet.mock.calls.length
  await act(async () => finish({ success: true, data: { message: sent } })); expect(mockGet).toHaveBeenCalledTimes(count); expect(mockPush).not.toHaveBeenCalled()
})
it('Y: dirty Back и focus/refetch сохраняют draft', async () => {
  const screen = render(draw()); await screen.findByLabelText('Ответ клиенту'); fireEvent.changeText(screen.getByLabelText('Ответ клиенту'), 'Draft'); expect(mockPrevented).toBe(true)
  act(() => mockBack({ data: { action: { type: 'GO_BACK' } } })); expect(Alert.alert).toHaveBeenCalledWith('Есть неотправленный ответ', expect.any(String), expect.any(Array))
  mockFocus += 1; screen.rerender(draw()); await screen.findByLabelText('Ответ клиенту'); expect(screen.getByLabelText('Ответ клиенту').props.value).toBe('Draft')
})
it('Y: связанные записи только текущего cache; безопасные URLs без file/javascript', async () => {
  mockConversation.clientId = otherId; mockConversation.eventId = messageId; mockList.mockImplementation(async (kind: string) => kind === 'clients' ? [{ _id: otherId }] : [])
  mockMessages = [{ ...incoming, text: 'https://example.invalid/info file:///secret javascript:alert(1)' }]
  const screen = render(draw()); await screen.findByText('Клиент'); expect(screen.queryByText('Заказ')).toBeNull()
  mockCache.mockResolvedValueOnce(null); fireEvent.press(screen.getByText('Клиент')); await screen.findByText('Связанная запись больше недоступна. Обновите данные.'); expect(mockPush).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Открыть ссылку 1')); await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith('https://example.invalid/info')); expect(Linking.openURL).toHaveBeenCalledTimes(1)
})
it('Y: late GET старого route не возвращает чужие сообщения/draft/ссылки', async () => {
  const screen = render(draw()); await screen.findByLabelText('Ответ клиенту'); fireEvent.changeText(screen.getByLabelText('Ответ клиенту'), 'Старый draft')
  let finish!: (value: any) => void; mockGet.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })); fireEvent.press(screen.getByText('Обновить переписку'))
  const oldHistory = history(); mockParams = { provider: 'vk', id: otherId }; mockConversation = { _id: otherId, status: 'open', unreadCount: 0, clientName: 'Текущий клиент' }; mockMessages = []
  screen.rerender(draw()); await screen.findByLabelText('Ответ клиенту'); await act(async () => finish(oldHistory)); expect(screen.queryByText(incoming.text)).toBeNull(); expect(screen.getByLabelText('Ответ клиенту').props.value).toBe(''); expect(screen.getByText('Текущий клиент')).toBeTruthy()
})
it('Y: status 403 и устаревшее подтверждение после refresh не изменяют status', async () => {
  const screen = render(draw()); await screen.findByLabelText('Ответ клиенту'); fireEvent.press(screen.getByText('Закрыть диалог')); const oldConfirm = (Alert.alert as jest.Mock).mock.calls.at(-1)[2][1].onPress
  await act(async () => fireEvent.press(screen.getByText('Обновить переписку'))); await act(async () => oldConfirm()); expect(mockPatch).not.toHaveBeenCalled()
  mockPatch.mockRejectedValueOnce(Object.assign(new Error('secret'), { status: 403 })); fireEvent.press(screen.getByText('Игнорировать')); await confirm(); await screen.findByText('Нет доступа или функция недоступна на текущем тарифе.'); expect(screen.queryByText('Игнорируется')).toBeNull(); expect(screen.getByText('В работе')).toBeTruthy()
})
it('Y: unread read-back и failed exact message не подтверждают успех; PATCH/POST не повторяется на GET', async () => {
  const screen = render(draw()); await screen.findByLabelText('Ответ клиенту'); mockPatch.mockResolvedValueOnce({ success: true, data: { ...mockConversation, unreadCount: 0 } }); fireEvent.press(screen.getByText('Отметить прочитанным'))
  await screen.findByText('Проверить действие по истории'); expect(screen.queryByText('Диалог отмечен прочитанным.')).toBeNull()
  mockConversation.unreadCount = 0; fireEvent.press(screen.getByText('Проверить действие по истории')); await screen.findByText('Диалог отмечен прочитанным.'); expect(mockPatch).toHaveBeenCalledTimes(1)
  mockPost.mockImplementationOnce(async () => { mockMessages.push({ ...sent, status: 'failed' }); return { success: true, data: { message: sent } } }); fireEvent.changeText(screen.getByLabelText('Ответ клиенту'), 'Старый ответ'); fireEvent.press(screen.getByText('Отправить')); await screen.findByText('Отправка не подтверждена. Текст сохранён. Обновите историю перед повторной отправкой.'); expect(screen.getByLabelText('Ответ клиенту').props.value).toBe('Старый ответ'); expect(screen.queryByText('Отправлено. Доставка клиенту не подтверждена.')).toBeNull()
})
