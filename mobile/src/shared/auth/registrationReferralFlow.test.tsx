import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import LoginScreen from '../../../app/(auth)/login'

const id = '111111111111111111111111'
let mockParams: { mode?: string; ref?: string } = {}
let mockVkResult: unknown = null
let mockStored: string | null = null
const mockPrompt = jest.fn()
const mockCompleteSignIn = jest.fn(async () => {})
const mockPost = jest.fn(async (path: string, _body: unknown) => ({
  success: true,
  data: path.endsWith('/start')
    ? { id: 1, auth_phone: '78000000000' }
    : path.endsWith('/check')
      ? { confirmed: true }
      : { user: { _id: 'test' } },
}))
jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }))
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'vedelo://auth/vk',
  ResponseType: { Code: 'code' },
  useAuthRequest: () => [
    { codeVerifier: 'test-verifier' },
    mockVkResult,
    mockPrompt,
  ],
}))
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => mockStored,
  setItemAsync: async (_key: string, value: string) => {
    mockStored = value
  },
  deleteItemAsync: async () => {
    mockStored = null
  },
}))
jest.mock('../api/client', () => ({
  api: { post: (path: string, body: unknown) => mockPost(path, body) },
}))
jest.mock('./AuthProvider', () => ({
  useAuth: () => ({ completeSignIn: mockCompleteSignIn }),
}))
jest.mock('../config/env', () => ({
  env: {
    apiBaseUrl: 'http://test/api',
    appScheme: 'vedelo',
    vkIdAppId: 'test',
  },
}))
jest.mock('../ui/components', () => {
  const { View, Text, TextInput, Pressable } = require('react-native')
  return {
    Screen: View,
    Surface: View,
    Field: ({ label, ...props }: any) => (
      <TextInput testID={label} {...props} />
    ),
    Button: ({ title, onPress, testID, disabled }: any) => (
      <Pressable testID={testID} disabled={disabled} onPress={onPress}>
        <Text>{title}</Text>
      </Pressable>
    ),
    ErrorNotice: ({ message }: any) => <Text>{message}</Text>,
  }
})

describe('Android referral registration', () => {
  beforeEach(() => {
    mockParams = { mode: 'register', ref: id }
    mockVkResult = null
    mockStored = null
    mockPost.mockClear()
    mockPrompt.mockClear()
    mockCompleteSignIn.mockClear()
  })
  const consent = (screen: ReturnType<typeof render>) => {
    fireEvent.press(screen.getByText(/^Принимаю/))
    fireEvent.press(screen.getByText(/^Ознакомился/))
    fireEvent.press(screen.getByText(/^Отдельно даю/))
  }
  it('deep link -> legal acceptance -> VK callback sends the invitation', async () => {
    const screen = render(<LoginScreen />)
    expect(screen.getByText('Зарегистрироваться через VK ID')).toBeTruthy()
    consent(screen)
    fireEvent.press(screen.getByTestId('submit-vk-auth'))
    expect(mockPrompt).toHaveBeenCalledTimes(1)
    mockVkResult = {
      type: 'success',
      params: { code: 'test-code', device_id: 'test-device' },
    }
    screen.rerender(<LoginScreen />)
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/mobile/v1/auth/vk',
        expect.objectContaining({
          mode: 'register',
          referrerId: id,
          consentTerms: true,
          consentPrivacyPolicy: true,
          consentPersonalData: true,
        })
      )
    )
    await waitFor(() => expect(mockCompleteSignIn).toHaveBeenCalledTimes(1))
  })
  it('an ordinary VK login does not send a saved invitation', async () => {
    mockParams = { mode: 'login' }
    mockStored = JSON.stringify({ referrerId: id, capturedAt: Date.now() })
    const screen = render(<LoginScreen />)
    mockVkResult = {
      type: 'success',
      params: { code: 'test-code', device_id: 'test-device' },
    }
    screen.rerender(<LoginScreen />)
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/mobile/v1/auth/vk',
        expect.objectContaining({ mode: 'login', referrerId: undefined })
      )
    )
  })
  it('phone registration carries the same invitation after verification', async () => {
    const screen = render(<LoginScreen />)
    consent(screen)
    fireEvent.changeText(screen.getByTestId('auth-phone'), '79000000000')
    fireEvent.changeText(screen.getByTestId('auth-password'), 'Password123!')
    fireEvent.changeText(screen.getByTestId('Повторите пароль'), 'Password123!')
    fireEvent.press(screen.getByTestId('submit-auth'))
    await waitFor(() =>
      expect(screen.getByText('Я позвонил — проверить')).toBeTruthy()
    )
    fireEvent.press(screen.getByText('Я позвонил — проверить'))
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/mobile/v1/auth/register',
        expect.objectContaining({ referrerId: id })
      )
    )
  })
})
