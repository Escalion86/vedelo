import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import ShareScreen from '../../../app/native/share'
import { readIncomingShare, queueSharedFiles } from './share'
import { setSharedDraft } from './shareDraft'
import { ThemeProvider } from '../ui/ThemeProvider'
let mockLocked = false
const mockPush = jest.fn(), mockReplace = jest.fn()
const mockEntityId = 'a'.repeat(24)
const shareId = '11111111-1111-4111-8111-111111111111'
const fileId = '22222222-2222-4222-8222-222222222222'
jest.mock('expo-router', () => ({ router: { push: (path: string) => mockPush(path), replace: (path: string) => mockReplace(path) }, useLocalSearchParams: () => ({ shareId }) }))
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ authenticated: true, user: { _id: 'u', tenantId: 't' } }) }))
jest.mock('../auth/AppLockProvider', () => ({ useAppLock: () => ({ locked: mockLocked }) }))
jest.mock('../auth/tokenStore', () => ({ getAuthSessionEpoch: () => 1 }))
jest.mock('../storage/cache', () => ({ listCachedEntities: async (kind: string) => kind === 'events' ? [{ _id: mockEntityId, eventType: 'Консультация', description: 'Уточнить время' }] : [] }))
jest.mock('../sync/syncEngine', () => ({ runSync: jest.fn().mockResolvedValue(undefined) }))
jest.mock('./device', () => ({ deviceSession: () => ({ generation: 'g' }), device: { discardShare: jest.fn().mockResolvedValue(undefined) } }))
jest.mock('./share', () => ({ readIncomingShare: jest.fn(), queueSharedFiles: jest.fn() }))
jest.mock('./shareDraft', () => ({ setSharedDraft: jest.fn() }))
jest.mock('../hooks/useWorkItemTerminology', () => ({ useWorkItemTerminology: () => ({ plural: 'Заказы', labelCapitalized: 'Заказ' }) }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
beforeEach(() => {
  jest.clearAllMocks(); mockLocked = false
  ;(readIncomingShare as jest.Mock).mockResolvedValue({ id: shareId, text: 'Исходный текст', problem: '', files: [{ id: fileId, name: 'Счёт.pdf', mimeType: 'application/pdf', size: 1024 }] })
  ;(queueSharedFiles as jest.Mock).mockResolvedValue(undefined)
})
it.each(['light', 'dark'] as const)('%s: preview alone never saves, uploads or runs AI; form receives edited text', async (mode) => {
  const screen = render(<ThemeProvider forcedMode={mode} storage={null}><ShareScreen /></ThemeProvider>)
  const input = await screen.findByLabelText('Проверьте и исправьте текст')
  expect(queueSharedFiles).not.toHaveBeenCalled(); expect(setSharedDraft).not.toHaveBeenCalled()
  fireEvent.changeText(input, 'Проверенный текст')
  fireEvent.press(screen.getByText('Подготовить текст для ИИ'))
  expect(setSharedDraft).toHaveBeenCalledWith({ id: shareId, generation: 'g', text: 'Проверенный текст', mode: 'text' })
  expect(mockPush).toHaveBeenCalledWith(`/events/assistant?mode=text&shareDraft=${shareId}`)
  expect(queueSharedFiles).not.toHaveBeenCalled()
})
it('files require checkbox, target and a separate save; double press queues once', async () => {
  const screen = render(<ShareScreen />)
  const checkbox = await screen.findByRole('checkbox', { name: 'Счёт.pdf, 1 КБ' })
  expect(screen.getByRole('button', { name: 'Добавить выбранные файлы (0)' }).props.accessibilityState.disabled).toBe(true)
  fireEvent.press(checkbox); fireEvent.press(screen.getByRole('radio', { name: 'Консультация · Уточнить время' }))
  const button = screen.getByText('Добавить выбранные файлы (1)')
  fireEvent.press(button); fireEvent.press(button)
  await screen.findByText(/Вложения добавлены в очередь/)
  expect(queueSharedFiles).toHaveBeenCalledTimes(1)
  expect(queueSharedFiles).toHaveBeenCalledWith(expect.objectContaining({ id: shareId }), [fileId], 'events', mockEntityId, expect.any(Function))
})
it('locked application cannot read the incoming text', async () => {
  mockLocked = true
  const screen = render(<ShareScreen />)
  await act(async () => undefined)
  expect(readIncomingShare).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Проверьте и исправьте текст')).toBeNull()
  mockLocked = false; screen.rerender(<ShareScreen />)
  await waitFor(() => expect(readIncomingShare).toHaveBeenCalledTimes(1))
})
