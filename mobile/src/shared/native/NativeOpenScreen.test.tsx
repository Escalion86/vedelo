import React from 'react'
import { render, waitFor, act } from '@testing-library/react-native'
import NativeOpenScreen from '../../../app/native/open'
import { pendingNativeIntent, queueNativeIntent, resetNativeIntents } from './intents'

const mockGet = jest.fn(), mockCache = jest.fn(), mockPublish = jest.fn(), mockReplace = jest.fn()
let mockLocked = false, mockEpoch = 1, mockRouteIntent: string | undefined
jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) }, useLocalSearchParams: () => ({ intent: mockRouteIntent }) }))
jest.mock('../api/client', () => ({ api: { get: (...args: unknown[]) => mockGet(...args) } }))
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ authenticated: true, loading: false, onboardingRequired: false }) }))
jest.mock('../auth/AppLockProvider', () => ({ useAppLock: () => ({ locked: mockLocked }) }))
jest.mock('../auth/tokenStore', () => ({ getAuthSessionEpoch: () => mockEpoch }))
jest.mock('../storage/cache', () => ({ getCachedEntity: (...args: unknown[]) => mockCache(...args), publishEntityReadback: (...args: unknown[]) => mockPublish(...args) }))
const id = 'a'.repeat(24)
beforeEach(() => { jest.clearAllMocks(); resetNativeIntents(); mockLocked = false; mockEpoch = 1; mockRouteIntent = undefined; mockCache.mockResolvedValue({ _id: id }); mockGet.mockResolvedValue({ data: { _id: id } }); queueNativeIntent(`/events/${id}`) })
it('an already mounted gate waits for the matching second system URL before consuming it', async () => {
  const first = queueNativeIntent('/native/call-results', { systemNavigation: true })!
  mockRouteIntent = String(first.key); mockLocked = true
  const screen = render(<NativeOpenScreen />)
  let latest!: NonNullable<ReturnType<typeof queueNativeIntent>>
  act(() => { latest = queueNativeIntent('/native/settings', { systemNavigation: true })! })
  mockLocked = false; screen.rerender(<NativeOpenScreen />)
  expect(mockReplace).not.toHaveBeenCalled(); expect(pendingNativeIntent()?.key).toBe(latest.key)
  mockRouteIntent = String(latest.key); screen.rerender(<NativeOpenScreen />)
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/native/settings'))
  expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)')
})
it('waits for unlock and validates ownership before opening', async () => {
  mockLocked = true
  const screen = render(<NativeOpenScreen />)
  expect(mockGet).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled()
  mockLocked = false; screen.rerender(<NativeOpenScreen />)
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(`/events/${id}`))
  expect(mockGet).toHaveBeenCalledWith(`/mobile/v1/events/${id}`)
  expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)')
})
it('never uses a cached record after a tenant access rejection', async () => {
  mockGet.mockRejectedValue({ status: 403 })
  const screen = render(<NativeOpenScreen />)
  await screen.findByText('Не удалось открыть запись. Проверьте доступ и подключение к интернету.')
  expect(mockReplace).not.toHaveBeenCalled(); expect(mockPublish).not.toHaveBeenCalled()
})
it('rejects a successful response that contains a different entity', async () => {
  mockGet.mockResolvedValue({ data: { _id: 'b'.repeat(24) } })
  const screen = render(<NativeOpenScreen />)
  await screen.findByText('Не удалось открыть запись. Проверьте доступ и подключение к интернету.')
  expect(mockReplace).not.toHaveBeenCalled(); expect(mockPublish).not.toHaveBeenCalled()
})
it('supports an offline local copy and does not open late replies in a new session', async () => {
  mockGet.mockRejectedValue(new TypeError('offline'))
  const first = render(<NativeOpenScreen />)
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(`/events/${id}`)); first.unmount()
  mockReplace.mockClear(); queueNativeIntent(`/events/${id}`)
  let complete!: (value: unknown) => void
  mockGet.mockImplementation(() => new Promise(resolve => { complete = resolve }))
  render(<NativeOpenScreen />); await waitFor(() => expect(complete).toBeDefined())
  mockEpoch++
  await act(async () => complete({ data: { _id: id } }))
  expect(mockReplace).not.toHaveBeenCalled(); expect(mockPublish).not.toHaveBeenCalled()
})
