import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Button } from '../../shared/ui/components'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { EventClientReviewStatus } from './EventClientReviewStatus'
import { useRefreshReviews } from './hooks'
import { api } from '../../shared/api/client'

let mockUser = { _id: 'u', tenantId: 'tenant' }
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../../shared/api/client', () => ({ api: { get: jest.fn() } }))
jest.mock('../profile/uploadOnce', () => ({ uploadOnce: jest.fn() }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'Icon' }))
let client: QueryClient
beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { _id: 'u', tenantId: 'tenant' }
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
})
afterEach(() => client.clear())
function Cards() {
  const refresh = useRefreshReviews()
  return <><EventClientReviewStatus eventId="one" /><EventClientReviewStatus eventId="two" /><EventClientReviewStatus eventId="three" /><Button title="Обновить отзывы" onPress={() => void refresh()} /></>
}
function tree(theme: 'light' | 'dark' = 'light') {
  return <QueryClientProvider client={client}><ThemeProvider forcedMode={theme} storage={null}><Cards /></ThemeProvider></QueryClientProvider>
}
it.each(['light', 'dark'] as const)('real refresh invalidates one identity-scoped bulk map for all cards: %s', async (theme) => {
  let rating = 2
  ;(api.get as jest.Mock).mockImplementation(async () => ({ success: true, data: Object.fromEntries(['one', 'two', 'three'].map(id => [id, { status: 'received', rating }])) }))
  const screen = render(tree(theme))
  expect(await screen.findAllByText('★ 2 из 5')).toHaveLength(3)
  expect(api.get).toHaveBeenCalledTimes(1)
  rating = 5
  fireEvent.press(screen.getByText('Обновить отзывы'))
  expect(await screen.findAllByText('★ 5 из 5')).toHaveLength(3)
  expect(api.get).toHaveBeenCalledTimes(2)
  expect((api.get as jest.Mock).mock.calls.every(([path]) => path === '/client-reviews/statuses')).toBe(true)
  expect(client.getQueryData(['nativeReviews', 'u', 'tenant', 'statuses'])).toMatchObject({ one: { rating: 5 } })
})
it('identity change loads a separate bulk map and never displays the previous tenant rating', async () => {
  let finish!: (value: unknown) => void
  ;(api.get as jest.Mock).mockResolvedValueOnce({ success: true, data: { one: { status: 'received', rating: 2 } } })
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const screen = render(tree())
  await screen.findByText('★ 2 из 5')
  mockUser = { _id: 'other', tenantId: 'other-tenant' }
  screen.rerender(tree())
  expect(screen.queryByText('★ 2 из 5')).toBeNull()
  await act(async () => finish({ success: true, data: { one: { status: 'received', rating: 4 } } }))
  await screen.findByText('★ 4 из 5')
  expect(api.get).toHaveBeenCalledTimes(2)
  expect(client.getQueryData(['nativeReviews', 'other', 'other-tenant', 'statuses'])).toMatchObject({ one: { rating: 4 } })
})
