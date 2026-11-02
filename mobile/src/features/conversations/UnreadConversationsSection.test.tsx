import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UnreadConversationsSection } from './UnreadConversationsSection'
const mockGet = jest.fn(), mockPush = jest.fn()
jest.mock('../../shared/api/client', () => ({ api: { get: (...args: unknown[]) => mockGet(...args) } }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ authenticated: true, user: { _id: 'user-a', tenantId: 'tenant-a' } }) }))
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) }, useFocusEffect: () => {} }))
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}><UnreadConversationsSection /></QueryClientProvider>)
beforeEach(() => jest.clearAllMocks())
it('shows Telegram unread messages and opens the filtered client conversations', async () => {
  const clientId = 'a'.repeat(24)
  mockGet.mockResolvedValue({ success: true, data: { unreadItems: [{ key: clientId, clientId, clientName: 'Клиент', unreadCount: 2, providers: ['telegram'], lastMessageText: 'Уточните время', lastMessageAt: null }] } })
  const screen = open()
  await screen.findByText('Уточните время'); fireEvent.press(screen.getByText('Открыть переписку'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/conversations', params: { clientId } })
  expect(screen.getByText('Непрочитанные сообщения (2)')).toBeTruthy()
})
it.each(['offline', 'malformed'])('does not report an empty inbox on a %s response', async kind => {
  mockGet.mockImplementation(() => kind === 'offline' ? Promise.reject(new Error('offline')) : Promise.resolve({ success: true, data: {} }))
  const screen = open()
  await screen.findByText('Не удалось обновить непрочитанные сообщения.')
  expect(screen.queryByText('Новых сообщений нет')).toBeNull()
})
