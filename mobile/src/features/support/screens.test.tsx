import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { lightPalette, darkPalette } from '../../shared/ui/theme'
import React from 'react'
import { Linking } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import SupportTicketsScreen from '../../../app/support'
import SupportTicketScreen from '../../../app/support/[id]'
import NewSupportTicketScreen from '../../../app/support/new'
import * as api from './api'
import { SUPPORT_UNAVAILABLE_MESSAGE } from './userAccess'

let mockUser: { _id: string; tenantId: string; role: string } | null
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNetwork = jest.fn()
const image = { uri: 'file:///test.jpg', name: 'test.jpg', mimeType: 'image/jpeg', size: 100 }

jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: () => mockNetwork() } }))
jest.mock('expo-router', () => ({
  router: { push: (path: string) => mockPush(path), replace: (path: string) => mockReplace(path) },
  useLocalSearchParams: () => ({ id: 'ticket-1' }),
  useFocusEffect: (callback: () => void) => {
    require('react').useEffect(callback, [callback])
  },
}))
jest.mock('./api', () => ({
  __esModule: true,
  listSupportTickets: jest.fn(), getSupportTicket: jest.fn(), createSupportTicket: jest.fn(),
  replySupportTicket: jest.fn(), markSupportTicketRead: jest.fn(), getSupportUnreadCount: jest.fn(),
}))
jest.mock('./ImagePicker', () => ({
  SupportImagePicker: ({ onChange }: { onChange: (images: unknown[]) => void }) => {
    const { Button } = require('react-native')
    return <Button title="Добавить тестовое вложение" onPress={() => onChange([
      { uri: 'file:///test.jpg', name: 'test.jpg', mimeType: 'image/jpeg', size: 100 },
    ])} />
  },
}))

const ticket = { id: 'ticket-1', tenantId: 'own-tenant', title: 'Мой вопрос', category: 'question', status: 'in_progress', unread: true, createdByLabel: 'Автор обращения', lastMessageAt: '2026-10-01' }
const incoming = { id: 'incoming', authorRole: 'developer', authorLabel: 'Разработчик', body: 'Ответ поддержки', createdAt: '2026-10-01', attachments: [{ url: 'https://example.test/image.jpg', name: 'image.jpg' }] }
const outgoing = { id: 'outgoing', authorRole: 'user', authorLabel: 'Я', body: 'Мой вопрос', createdAt: '2026-10-01', attachments: [] }
const detail = { data: { ticket, messages: [outgoing, incoming] }, meta: { hasMore: false, nextCursor: null } }

beforeEach(() => {
  jest.resetAllMocks()
  mockUser = { _id: 'own-user', tenantId: 'own-tenant', role: 'user' }
  mockNetwork.mockResolvedValue({ isConnected: true })
  ;(api.listSupportTickets as jest.Mock).mockResolvedValue({ data: [ticket], meta: { hasMore: false, nextCursor: null } })
  ;(api.getSupportTicket as jest.Mock).mockResolvedValue(detail)
  ;(api.createSupportTicket as jest.Mock).mockResolvedValue({ data: { ticket } })
  ;(api.replySupportTicket as jest.Mock).mockResolvedValue({ data: { ticket, message: { ...outgoing, id: 'reply', body: 'Спасибо' } } })
})

it.each([
  ['list', SupportTicketsScreen], ['detail', SupportTicketScreen], ['new', NewSupportTicketScreen],
] as const)('прямой маршрут %s для dev не монтирует пользовательские действия и не вызывает API', async (_name, Component) => {
  mockUser = { _id: 'developer', tenantId: 'developer-tenant', role: 'dev' }
  const screen = render(<Component />)
  await act(async () => undefined)
  expect(screen.getByText(SUPPORT_UNAVAILABLE_MESSAGE)).toBeTruthy()
  expect(screen.queryByText('Обращения пользователей')).toBeNull()
  expect(screen.queryByText('Создать тикет')).toBeNull()
  expect(screen.queryByText('Отправить')).toBeNull()
  expect(screen.queryByText('Автор обращения')).toBeNull()
  for (const request of Object.values(api).filter((value) => typeof value === 'function')) expect(request).not.toHaveBeenCalled()
  expect(mockNetwork).not.toHaveBeenCalled()
  expect(mockUser.role).toBe('dev')
})

it('не запрашивает поддержку, пока пользователь не загружен', async () => {
  mockUser = null
  const screen = render(<SupportTicketsScreen />)
  await act(async () => undefined)
  expect(screen.getByText(/войдите в пользовательский аккаунт/)).toBeTruthy()
  expect(api.listSupportTickets).not.toHaveBeenCalled()
})

it('показывает личный список, следующую страницу и переходы к созданию и переписке', async () => {
  ;(api.listSupportTickets as jest.Mock).mockResolvedValueOnce({ data: [ticket], meta: { hasMore: true, nextCursor: 'next' } })
    .mockResolvedValueOnce({ data: [{ ...ticket, id: 'ticket-2', title: 'Второе обращение' }], meta: { hasMore: false } })
  const screen = render(<SupportTicketsScreen />)
  await screen.findByText('Мой вопрос')
  expect(screen.queryByText('Автор обращения')).toBeNull()
  fireEvent.press(screen.getByText('Мой вопрос'))
  expect(mockPush).toHaveBeenCalledWith('/support/ticket-1')
  fireEvent.press(screen.getByLabelText('Новое обращение'))
  expect(mockPush).toHaveBeenCalledWith('/support/new')
  fireEvent.press(screen.getByText('Показать ещё'))
  await screen.findByText('Второе обращение')
  expect(api.listSupportTickets).toHaveBeenLastCalledWith({ cursor: 'next' })
})

it('читает переписку, располагает developer-сообщение как входящее, открывает вложение и отправляет ответ', async () => {
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
  const screen = render(<SupportTicketScreen />)
  await screen.findByText('Ответ поддержки')
  expect(api.markSupportTicketRead).toHaveBeenCalledWith('ticket-1')
  expect(screen.getByTestId('support-message-incoming')).toHaveStyle({ justifyContent: 'flex-start' })
  expect(screen.getByTestId('support-message-outgoing')).toHaveStyle({ justifyContent: 'flex-end' })
  expect(screen.queryByText(/Автор:/)).toBeNull()
  expect(screen.queryByText('Решён')).toBeNull()
  fireEvent.press(screen.getByLabelText('image.jpg'))
  expect(openUrl).toHaveBeenCalledWith('https://example.test/image.jpg')
  fireEvent.changeText(screen.getByPlaceholderText('Напишите сообщение…'), ' Спасибо ')
  fireEvent.press(screen.getByText('Добавить тестовое вложение'))
  ;(api.getSupportTicket as jest.Mock).mockResolvedValue({ ...detail, data: { ticket, messages: [...detail.data.messages, { ...outgoing, id: 'reply', body: 'Спасибо' }] } })
  fireEvent.press(screen.getByText('Отправить'))
  await screen.findByText('Спасибо')
  expect(api.replySupportTicket).toHaveBeenCalledWith('ticket-1', 'Спасибо', [image])
  expect(screen.getByPlaceholderText('Напишите сообщение…').props.value).toBe('')
  openUrl.mockRestore()
})

it('загружает ранние сообщения и сохраняет текст после сетевой ошибки ответа', async () => {
  ;(api.getSupportTicket as jest.Mock).mockResolvedValueOnce({ ...detail, meta: { hasMore: true, nextCursor: 'older' } })
    .mockResolvedValueOnce({ data: { ticket, messages: [{ ...outgoing, id: 'old', body: 'Ранее' }] }, meta: { hasMore: false } })
  ;(api.replySupportTicket as jest.Mock).mockRejectedValue(new Error('Сбой отправки'))
  const screen = render(<SupportTicketScreen />)
  await screen.findByText('Показать ранние сообщения')
  fireEvent.press(screen.getByText('Показать ранние сообщения'))
  await screen.findByText('Ранее')
  expect(api.getSupportTicket).toHaveBeenLastCalledWith('ticket-1', 'older')
  fireEvent.changeText(screen.getByPlaceholderText('Напишите сообщение…'), 'Ответ')
  fireEvent.press(screen.getByText('Отправить'))
  await screen.findByText('Сбой отправки')
  expect(screen.getByPlaceholderText('Напишите сообщение…').props.value).toBe('Ответ')
})

it('создаёт личное обращение с категорией и вложением', async () => {
  const screen = render(<NewSupportTicketScreen />)
  fireEvent.press(screen.getByText('Создать тикет'))
  expect(screen.getByText('Заполните тему и сообщение')).toBeTruthy()
  expect(api.createSupportTicket).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Вопрос'))
  fireEvent.changeText(screen.getByPlaceholderText('Коротко опишите обращение'), ' Тема ')
  fireEvent.changeText(screen.getByPlaceholderText('Что произошло или что вы хотите предложить?'), ' Текст ')
  fireEvent.press(screen.getByText('Добавить тестовое вложение'))
  fireEvent.press(screen.getByText('Создать тикет'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/support/ticket-1'))
  expect(api.createSupportTicket).toHaveBeenCalledWith({ category: 'question', title: 'Тема', message: 'Текст', images: [image] })
})

it('не показывает прежнюю переписку после переключения на dev', async () => {
  const screen = render(<SupportTicketScreen />)
  await screen.findByText('Ответ поддержки')
  jest.clearAllMocks()
  mockUser = { _id: 'developer', tenantId: 'developer-tenant', role: 'dev' }
  screen.rerender(<SupportTicketScreen />)
  expect(screen.getByText(SUPPORT_UNAVAILABLE_MESSAGE)).toBeTruthy()
  expect(screen.queryByText('Ответ поддержки')).toBeNull()
  for (const request of Object.values(api).filter((value) => typeof value === 'function')) expect(request).not.toHaveBeenCalled()
})

it('ошибка списка не выдаётся за пустую поддержку', async () => {
  ;(api.listSupportTickets as jest.Mock).mockRejectedValue(new Error('Нет сети'))
  const screen = render(<SupportTicketsScreen />)
  await screen.findByText('Нет сети')
  expect(screen.queryByText('Обращений пока нет')).toBeNull()
})

it('двойное создание блокируется до завершения NetInfo, потерянный ответ сохраняет черновик и не повторяется', async () => {
  let finishNetwork: (value: unknown) => void = () => undefined
  mockNetwork.mockImplementationOnce(() => new Promise(resolve => { finishNetwork = resolve }))
  ;(api.createSupportTicket as jest.Mock).mockRejectedValue(new Error('Ответ потерян'))
  const screen = render(<NewSupportTicketScreen />)
  fireEvent.changeText(screen.getByPlaceholderText('Коротко опишите обращение'), 'Тема')
  fireEvent.changeText(screen.getByPlaceholderText('Что произошло или что вы хотите предложить?'), 'Черновик')
  fireEvent.press(screen.getByText('Создать тикет')); fireEvent.press(screen.getByText('Создать тикет'))
  expect(mockNetwork).toHaveBeenCalledTimes(1)
  await act(async () => finishNetwork({ isConnected: true }))
  await screen.findByText('Ответ потерян')
  expect(screen.getByPlaceholderText('Что произошло или что вы хотите предложить?').props.value).toBe('Черновик')
  fireEvent.press(screen.getByText('Создать тикет'))
  expect(api.createSupportTicket).toHaveBeenCalledTimes(1)
  expect(mockReplace).not.toHaveBeenCalled()
})

it('позднее создание после переключения пользователя не открывает чужой тикет', async () => {
  let finish: (value: unknown) => void = () => undefined
  ;(api.createSupportTicket as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const screen = render(<NewSupportTicketScreen />)
  fireEvent.changeText(screen.getByPlaceholderText('Коротко опишите обращение'), 'Тема')
  fireEvent.changeText(screen.getByPlaceholderText('Что произошло или что вы хотите предложить?'), 'Черновик')
  fireEvent.press(screen.getByText('Создать тикет'))
  await waitFor(() => expect(api.createSupportTicket).toHaveBeenCalledTimes(1))
  mockUser = { _id: 'another', tenantId: 'another-tenant', role: 'user' }
  screen.rerender(<NewSupportTicketScreen />)
  await act(async () => finish({ data: { ticket } }))
  expect(mockReplace).not.toHaveBeenCalled()
  expect(api.getSupportTicket).not.toHaveBeenCalled()
  expect(screen.getByPlaceholderText('Коротко опишите обращение').props.value).toBe('')
})

it('reply read-back mismatch не очищает черновик и не объявляет доставку', async () => {
  const screen = render(<SupportTicketScreen />)
  await screen.findByText('Ответ поддержки')
  fireEvent.changeText(screen.getByPlaceholderText('Напишите сообщение…'), 'Остался черновик')
  fireEvent.press(screen.getByText('Отправить'))
  await screen.findByText('Ответ не подтверждён повторным чтением')
  expect(screen.getByPlaceholderText('Напишите сообщение…').props.value).toBe('Остался черновик')
  expect(screen.queryByText('Спасибо')).toBeNull()
})

it('фильтр поддержки инвалидирует старую страницу и не дублирует курсор', async () => {
  let finish: (value: unknown) => void = () => undefined
  ;(api.listSupportTickets as jest.Mock).mockResolvedValueOnce({ data: [ticket], meta: { hasMore: true, nextCursor: 'next' } })
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    .mockResolvedValueOnce({ data: [{ ...ticket, id: 'resolved', title: 'Решённый вопрос', status: 'resolved' }], meta: { hasMore: true, nextCursor: 'again' } })
    .mockResolvedValueOnce({ data: [{ ...ticket, id: 'resolved', title: 'Решённый вопрос', status: 'resolved' }], meta: { hasMore: true, nextCursor: 'again' } })
  const screen = render(<SupportTicketsScreen />); await screen.findByText('Мой вопрос')
  fireEvent.press(screen.getByText('Показать ещё')); fireEvent.press(screen.getByText('Решён'))
  await screen.findByText('Решённый вопрос')
  await act(async () => finish({ data: [{ ...ticket, id: 'late', title: 'Поздний тикет' }], meta: { hasMore: false } }))
  expect(screen.queryByText('Поздний тикет')).toBeNull()
  fireEvent.press(screen.getByText('Показать ещё'))
  await screen.findByText('Сервер повторил страницу. Обновите список обращений.')
  expect(screen.queryByText('Показать ещё')).toBeNull()
  expect(screen.getAllByText('Решённый вопрос')).toHaveLength(1)
})


it.each(['light', 'dark'] as const)('%s: пользовательская переписка и форма используют тему и доступные категории', async (mode) => {
  const palette = mode === 'dark' ? darkPalette : lightPalette
  const detailScreen = render(<ThemeProvider storage={null} forcedMode={mode}><SupportTicketScreen /></ThemeProvider>)
  await detailScreen.findByText('Ответ поддержки')
  expect(detailScreen.getByText('Ответ поддержки')).toHaveStyle({ color: palette.text })
  detailScreen.unmount()
  const form = render(<ThemeProvider storage={null} forcedMode={mode}><NewSupportTicketScreen /></ThemeProvider>)
  expect(form.getByLabelText('Тема')).toHaveStyle({ color: palette.text })
  expect(form.getByRole('button', { name: 'Вопрос' })).toBeTruthy()
})
