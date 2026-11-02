import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import Screen from '../../../app/native/task-action'
const mockApply = jest.fn(), mockReplace = jest.fn(), mockGet = jest.fn()
let mockLocked = false
const eventId = 'a'.repeat(24), taskId = 'b'.repeat(24)
jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) }, useLocalSearchParams: () => ({ eventId: 'a'.repeat(24), taskId: 'b'.repeat(24), action: 'postpone_1' }) }))
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ authenticated: true }) }))
jest.mock('../auth/AppLockProvider', () => ({ useAppLock: () => ({ locked: mockLocked }) }))
jest.mock('../auth/tokenStore', () => ({ getAuthSessionEpoch: () => 1 }))
jest.mock('../storage/cache', () => ({ getCachedEntity: (...args: unknown[]) => mockGet(...args) }))
jest.mock('../notifications/taskActions', () => ({ performNotificationTaskAction: (...args: unknown[]) => mockApply(...args) }))
beforeEach(() => { jest.clearAllMocks(); mockLocked = false; mockGet.mockResolvedValue({ _id: eventId, additionalEvents: [{ _id: taskId, title: 'Перезвонить клиенту' }] }); mockApply.mockResolvedValue('local-outbox') })
it('opens a preview, then applies only the explicit user action', async () => {
  const screen = render(<Screen />)
  await screen.findByText('Перезвонить клиенту'); expect(mockApply).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText('Перенести на завтра'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(`/events/${eventId}`))
  expect(mockApply).toHaveBeenCalledTimes(1)
  expect(mockApply).toHaveBeenCalledWith({ eventId, taskId, action: 'postpone_1' })
})
it('does not load or change CRM data while the app is locked', () => {
  mockLocked = true; render(<Screen />)
  expect(mockGet).not.toHaveBeenCalled(); expect(mockApply).not.toHaveBeenCalled()
})
it('does not invent a deleted task or mutate automatically when lookup fails', async () => {
  mockGet.mockResolvedValue(null)
  const screen = render(<Screen />)
  await screen.findByText('Сначала откройте карточку и обновите данные задачи.')
  expect(screen.queryByText('Перенести на завтра')).toBeNull(); expect(mockApply).not.toHaveBeenCalled()
})
