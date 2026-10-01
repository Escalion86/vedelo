import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { VoiceDraftSection } from './VoiceDraftSection'

let mockAllowAi = true
let mockOnline = true
const mockGet = jest.fn()
const mockPost = jest.fn()
const mockUpload = jest.fn()
const mockNetwork = jest.fn()
const mockPermission = jest.fn()
const mockRecorder = { stop: jest.fn(async () => undefined), prepareToRecordAsync: jest.fn(), record: jest.fn(), uri: 'file:///voice.m4a' }
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]) }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ user: { _id: 'user', tenantId: 'tenant', tariffId: 'tariff' } }) }))
jest.mock('../../shared/api/client', () => ({ api: {
  get: (path: string) => mockGet(path), post: (...args: unknown[]) => mockPost(...args), upload: (...args: unknown[]) => mockUpload(...args),
} }))
jest.mock('@react-native-community/netinfo', () => ({ __esModule: true,
  default: { fetch: () => mockNetwork() }, useNetInfo: () => ({ isConnected: mockOnline, isInternetReachable: mockOnline }),
}))
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} }, requestRecordingPermissionsAsync: () => mockPermission(),
  setAudioModeAsync: jest.fn(async () => undefined), useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ durationMillis: 0 }),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockAllowAi = true
  mockOnline = true
  mockGet.mockImplementation(async () => ({ data: { currentTariff: { allowAi: mockAllowAi } } }))
  mockPost.mockResolvedValue({ fields: { eventType: 'Свадьба', clientId: 'unknown-client' } })
  mockUpload.mockResolvedValue({ transcript: 'Свадьба' })
  mockNetwork.mockImplementation(async () => ({ isConnected: mockOnline }))
  mockPermission.mockResolvedValue({ granted: true })
})

it('прямой AI-режим без тарифа не получает доступ к записи и API распознавания', async () => {
  mockAllowAi = false
  const screen = render(<VoiceDraftSection initialMode="voice" onApply={jest.fn()} />)
  await screen.findByText(/ИИ недоступен на текущем тарифе/)
  expect(screen.queryByTestId('voice-draft-start')).toBeNull()
  expect(mockPermission).not.toHaveBeenCalled()
  expect(mockPost).not.toHaveBeenCalled()
  expect(mockUpload).not.toHaveBeenCalled()
})

it('свободный текст требует явного применения, не запрашивает микрофон и не сохраняет работу', async () => {
  const apply = jest.fn()
  const screen = render(<VoiceDraftSection initialMode="text" onApply={apply} />)
  const input = await screen.findByTestId('voice-draft-text')
  expect(screen.queryByTestId('voice-draft-start')).toBeNull()
  fireEvent.changeText(input, 'Свадьба завтра')
  fireEvent.press(screen.getByText('Разобрать текст'))
  await screen.findByTestId('voice-draft-apply')
  expect(mockPost).toHaveBeenCalledWith('/mobile/v1/events/ai-draft', { text: 'Свадьба завтра' })
  expect(apply).not.toHaveBeenCalled()
  expect(mockPermission).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('voice-draft-apply'))
  expect(apply).toHaveBeenCalledTimes(1)
  expect(screen.queryByTestId('voice-draft-apply')).toBeNull()
})

it('потеря сети между показом формы и действием блокирует отправку и запрос микрофона', async () => {
  const screen = render(<VoiceDraftSection initialMode="voice" onApply={jest.fn()} />)
  await screen.findByTestId('voice-draft-start')
  mockNetwork.mockResolvedValue({ isConnected: false })
  fireEvent.press(screen.getByTestId('voice-draft-start'))
  await screen.findByText(/Для ИИ нужен интернет/)
  expect(mockPermission).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByTestId('voice-draft-text'), 'Описание')
  fireEvent.press(screen.getByText('Разобрать текст'))
  await act(async () => undefined)
  expect(mockPost).not.toHaveBeenCalled()
})

it('голос запускается только по нажатию, передаёт расшифровку в тот же явный черновик', async () => {
  const apply = jest.fn()
  const screen = render(<VoiceDraftSection initialMode="voice" onApply={apply} />)
  await screen.findByTestId('voice-draft-start')
  expect(mockPermission).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('voice-draft-start'))
  await screen.findByTestId('voice-draft-stop')
  expect(mockRecorder.record).toHaveBeenCalledTimes(1)
  fireEvent.press(screen.getByTestId('voice-draft-stop'))
  await screen.findByTestId('voice-draft-apply')
  expect(mockUpload).toHaveBeenCalledTimes(1)
  expect(mockPost).toHaveBeenCalledWith('/mobile/v1/events/ai-draft', { text: 'Свадьба' })
  screen.unmount()
  expect(apply).not.toHaveBeenCalled()
})

it('отказ микрофона оставляет текст доступным', async () => {
  mockPermission.mockResolvedValue({ granted: false })
  const screen = render(<VoiceDraftSection initialMode="voice" onApply={jest.fn()} />)
  await screen.findByTestId('voice-draft-start')
  fireEvent.press(screen.getByTestId('voice-draft-start'))
  await waitFor(() => expect(screen.getByText(/Без доступа к микрофону/)).toBeTruthy())
  expect(screen.getByTestId('voice-draft-text')).toBeTruthy()
  expect(mockRecorder.record).not.toHaveBeenCalled()
})
