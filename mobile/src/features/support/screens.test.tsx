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
