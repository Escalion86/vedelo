import React from 'react'
import { Linking, StyleSheet } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import LoginScreen from '../../../app/(auth)/login'
import { ThemeProvider } from '../../shared/ui/ThemeProvider'
import { darkPalette, lightPalette } from '../../shared/ui/theme'
import { api } from '../../shared/api/client'

let mockParams: { mode?: string; ref?: string } = {}
let mockVkResult: unknown = null
let mockVkRequest: unknown = { codeVerifier: 'mock-verifier' }
const mockPrompt = jest.fn(), mockCompleteSignIn = jest.fn(), mockReplace = jest.fn()
const mockCapture = jest.fn()
jest.mock('expo-router', () => ({ router: { replace: (path: string) => mockReplace(path) }, useLocalSearchParams: () => mockParams }))
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }))
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'vedelo://auth/vk', ResponseType: { Code: 'code' },
  useAuthRequest: () => [mockVkRequest, mockVkResult, mockPrompt],
}))
jest.mock('../../shared/api/client', () => ({ api: { post: jest.fn() } }))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => ({ completeSignIn: mockCompleteSignIn }) }))
jest.mock('../../shared/auth/registrationReferral', () => ({
  normalizeRegistrationReferrer: (value: unknown) => typeof value === 'string' ? value : null,
  captureRegistrationReferrer: (value: unknown) => mockCapture(value),
}))
jest.mock('../../shared/config/env', () => ({ env: { apiBaseUrl: 'https://mock.test/api', appScheme: 'vedelo', vkIdAppId: 'mock-app' } }))
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }))
const session = { user: { _id: 'mock-user' }, accessToken: 'mock-access', refreshToken: 'mock-refresh' }
const options = { skipAuth: true, skipRefresh: true }
const consentNames = [
  'Принимаю Пользовательское соглашение',
  'Ознакомился с Политикой обработки персональных данных',
  'Отдельно даю согласие на обработку персональных данных',
]
const setup = (theme: 'light' | 'dark') => render(<ThemeProvider forcedMode={theme} storage={null}><LoginScreen /></ThemeProvider>)
const fill = (screen: ReturnType<typeof render>, repeat = false) => {
  fireEvent.changeText(screen.getByTestId('auth-phone'), '79990000000')
  fireEvent.changeText(screen.getByTestId('auth-password'), 'MockPassword123')
  if (repeat) fireEvent.changeText(screen.getByLabelText('Повторите пароль'), 'MockPassword123')
}
const consents = (screen: ReturnType<typeof render>) => consentNames.forEach(name => fireEvent.press(screen.getByRole('checkbox', { name })))
beforeEach(() => {
  jest.clearAllMocks(); mockParams = {}; mockVkResult = null; mockVkRequest = { codeVerifier: 'mock-verifier' }
  mockCapture.mockResolvedValue(undefined)
  ;(api.post as jest.Mock).mockImplementation(async (path: string) => ({ success: true, data: path.endsWith('/start') ? { id: 7, auth_phone: '78000000000' } : path.endsWith('/check') ? { confirmed: true } : session }))
})
describe.each(['light', 'dark'] as const)('%s: оформление авторизации', (theme) => {
  it('вход: тема, компактные защищённые поля, payload и переход', async () => {
    const screen = setup(theme), palette = theme === 'dark' ? darkPalette : lightPalette
    expect(StyleSheet.flatten(screen.getByTestId('auth-phone').props.style)).toMatchObject({ minHeight: 40, color: palette.text, backgroundColor: palette.surface })
    expect(screen.getByTestId('auth-password').props.secureTextEntry).toBe(true)
    expect(screen.getByRole('tab', { name: 'Вход' }).props.accessibilityState.selected).toBe(true)
    fill(screen); fireEvent.press(screen.getByTestId('submit-auth'))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'))
    expect(api.post).toHaveBeenCalledWith('/mobile/v1/auth/login', { phone: '79990000000', password: 'MockPassword123' }, options)
    expect(mockCompleteSignIn).toHaveBeenCalledWith(session)
  })
  it('три независимых согласия и ссылки: чтение не принимает согласие', async () => {
    mockParams = { mode: 'register' }
    const screen = setup(theme), open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    const links = ['Пользовательское соглашение', 'Политикой обработки персональных данных', 'согласие на обработку персональных данных']
    links.forEach((name, index) => {
      fireEvent.press(screen.getByRole('link', { name }))
      expect(open).toHaveBeenLastCalledWith(`https://mock.test/${['terms', 'privacy', 'personal-data-consent'][index]}`)
    })
    consentNames.forEach(name => expect(screen.getByRole('checkbox', { name }).props.accessibilityState.checked).toBe(false))
    fill(screen, true); fireEvent.press(screen.getByTestId('submit-auth'))
    await screen.findByText('Для регистрации примите юридические согласия')
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('checkbox', { name: consentNames[0] }))
    expect(screen.getByRole('checkbox', { name: consentNames[1] }).props.accessibilityState.checked).toBe(false)
    open.mockRestore()
  })
  it('регистрация: звонок, неподтверждённый ответ, прежний payload и referrer', async () => {
    mockParams = { mode: 'register', ref: 'mock-referrer' }; mockCapture.mockResolvedValue('mock-referrer')
    const screen = setup(theme); consents(screen); fill(screen, true)
    fireEvent.press(screen.getByTestId('submit-auth')); await screen.findByText('Подтверждение звонком')
    expect(api.post).toHaveBeenCalledWith('/phone/verify/start', { phone: '79990000000', flow: 'register' }, options)
    ;(api.post as jest.Mock).mockResolvedValueOnce({ success: true, data: { confirmed: false } })
    fireEvent.press(screen.getByText('Я позвонил — проверить'))
    await screen.findByText(/Звонок ещё не подтверждён/); expect(mockCompleteSignIn).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Я позвонил — проверить'))
    await waitFor(() => expect(mockCompleteSignIn).toHaveBeenCalledWith(session))
    expect(api.post).toHaveBeenCalledWith('/phone/verify/check', { phone: '79990000000', callId: 7 }, options)
    expect(api.post).toHaveBeenCalledWith('/mobile/v1/auth/register', { phone: '79990000000', password: 'MockPassword123', referrerId: 'mock-referrer', consentTerms: true, consentPrivacyPolicy: true, consentPersonalData: true }, options)
  })
  it('восстановление: SMS, ошибка кода, повтор и прежний payload', async () => {
    const screen = setup(theme); fireEvent.press(screen.getByText('Забыли пароль? Восстановить доступ'))
    expect(screen.getByText('Восстановление доступа')).toBeTruthy(); expect(screen.queryByTestId('submit-vk-auth')).toBeNull()
    fill(screen, true); fireEvent.press(screen.getByTestId('submit-auth')); await screen.findByText('Получить код по SMS')
    fireEvent.press(screen.getByText('Получить код по SMS')); await screen.findByText('Код из SMS')
    expect(api.post).toHaveBeenCalledWith('/phone/verify/sms/send', { phone: '79990000000', flow: 'recovery' }, options)
    fireEvent.changeText(screen.getByLabelText('Код'), '1234')
    ;(api.post as jest.Mock).mockRejectedValueOnce(new Error('Неверный код'))
    fireEvent.press(screen.getByText('Подтвердить код')); await screen.findByText('Неверный код'); expect(mockCompleteSignIn).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Подтвердить код'))
    await waitFor(() => expect(mockCompleteSignIn).toHaveBeenCalledWith(session))
    expect(api.post).toHaveBeenCalledWith('/phone/verify/sms/check', { phone: '79990000000', flow: 'recovery', code: '1234' }, options)
    expect(api.post).toHaveBeenCalledWith('/mobile/v1/auth/recovery', expect.objectContaining({ consentTerms: undefined, referrerId: undefined }), options)
  })
  it('текущая loading блокирует поля, режимы, согласия и повторные действия', async () => {
    let resolve!: (value: unknown) => void
    ;(api.post as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const screen = setup(theme); fill(screen); fireEvent.press(screen.getByTestId('submit-auth'))
    expect(screen.getByTestId('auth-phone').props.editable).toBe(false)
    expect(screen.getByRole('tab', { name: 'Регистрация' }).props.accessibilityState.disabled).toBe(true)
    expect(screen.getByTestId('submit-vk-auth').props.accessibilityState.disabled).toBe(true)
    fireEvent.press(screen.getByTestId('submit-auth')); expect(api.post).toHaveBeenCalledTimes(1)
    await act(async () => resolve({ success: true, data: session }))
  })
  it('VK: согласия, PKCE callback и прежние параметры', async () => {
    mockParams = { mode: 'register', ref: 'mock-referrer' }; mockCapture.mockResolvedValue('mock-referrer')
    const screen = setup(theme); fireEvent.press(screen.getByTestId('submit-vk-auth'))
    await screen.findByText('Для регистрации через VK ID примите юридические согласия'); expect(mockPrompt).not.toHaveBeenCalled()
    consents(screen); fireEvent.press(screen.getByTestId('submit-vk-auth')); expect(mockPrompt).toHaveBeenCalledTimes(1)
    mockVkResult = { type: 'success', params: { code: 'mock-code', device_id: 'mock-device', state: 'mock-state' } }
    screen.rerender(<ThemeProvider forcedMode={theme} storage={null}><LoginScreen /></ThemeProvider>)
    await waitFor(() => expect(mockCompleteSignIn).toHaveBeenCalledWith(session))
    expect(api.post).toHaveBeenCalledWith('/mobile/v1/auth/vk', { code: 'mock-code', device_id: 'mock-device', state: 'mock-state', code_verifier: 'mock-verifier', mode: 'register', referrerId: 'mock-referrer', consentTerms: true, consentPrivacyPolicy: true, consentPersonalData: true }, options)
  })
  it('ошибка входа остаётся Notice, перехода нет; режимы сохраняют поля', async () => {
    ;(api.post as jest.Mock).mockRejectedValueOnce(new Error('Неверный пароль'))
    const screen = setup(theme); fill(screen); fireEvent.press(screen.getByTestId('submit-auth')); await screen.findByText('Неверный пароль')
    expect(screen.getByRole('alert').props.accessibilityLabel).toBe('Ошибка: Неверный пароль'); expect(mockReplace).not.toHaveBeenCalled()
    fireEvent.press(screen.getByRole('tab', { name: 'Регистрация' })); expect(screen.getByTestId('auth-password').props.value).toBe('MockPassword123')
    fireEvent.press(screen.getByRole('tab', { name: 'Вход' })); expect(screen.queryByLabelText('Повторите пароль')).toBeNull()
    fireEvent.press(screen.getByText('Забыли пароль? Восстановить доступ')); fireEvent.press(screen.getByText('Вернуться ко входу')); expect(screen.getByRole('tab', { name: 'Вход' }).props.accessibilityState.selected).toBe(true)
  })
  it('ошибка VK показана через Notice, без завершения входа', async () => {
    ;(api.post as jest.Mock).mockRejectedValueOnce(new Error('Не удалось войти через VK ID'))
    mockVkResult = { type: 'success', params: { code: 'mock-code', device_id: 'mock-device' } }
    const screen = setup(theme); await screen.findByText('Не удалось войти через VK ID')
    expect(screen.getByTestId('submit-vk-auth').props.accessibilityState.disabled).toBe(false)
    expect(mockCompleteSignIn).not.toHaveBeenCalled(); expect(mockReplace).not.toHaveBeenCalled()
  })
  it('регистрация: loading согласий, ошибка SMS и возврат сохраняют данные', async () => {
    mockParams = { mode: 'register' }
    let resolve!: (value: unknown) => void
    ;(api.post as jest.Mock).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const screen = setup(theme); consents(screen); fill(screen, true); fireEvent.press(screen.getByTestId('submit-auth'))
    for (const name of consentNames) expect(screen.getByRole('checkbox', { name }).props.accessibilityState.disabled).toBe(true)
    fireEvent.press(screen.getByRole('checkbox', { name: consentNames[0] })); expect(screen.getByRole('checkbox', { name: consentNames[0] }).props.accessibilityState.checked).toBe(true)
    await act(async () => resolve({ success: true, data: { id: 7, auth_phone: '78000000000' } }))
    ;(api.post as jest.Mock).mockRejectedValueOnce(new Error('Не удалось отправить SMS'))
    fireEvent.press(screen.getByText('Получить код по SMS')); await screen.findByText('Не удалось отправить SMS')
    expect(screen.queryByText('Код из SMS')).toBeNull(); expect(mockCompleteSignIn).not.toHaveBeenCalled()
    fireEvent.press(screen.getByText('Изменить данные'))
    expect(screen.getByTestId('auth-password').props.value).toBe('MockPassword123')
    for (const name of consentNames) expect(screen.getByRole('checkbox', { name }).props.accessibilityState.checked).toBe(true)
  })
  it('валидация номера, пароля и повторного пароля не отправляет запрос', async () => {
    const screen = setup(theme); fireEvent.press(screen.getByTestId('submit-auth')); await screen.findByText('Введите корректный номер телефона')
    fireEvent.changeText(screen.getByTestId('auth-phone'), '79990000000'); fireEvent.press(screen.getByTestId('submit-auth')); await screen.findByText('Пароль должен быть не менее 8 символов')
    fireEvent.press(screen.getByRole('tab', { name: 'Регистрация' })); fill(screen); fireEvent.press(screen.getByTestId('submit-auth')); await screen.findByText('Пароли не совпадают')
    expect(api.post).not.toHaveBeenCalled()
  })
})
it('VK без request заблокирован; отмена OAuth не отправляет запрос', () => {
  mockVkRequest = null; mockVkResult = { type: 'cancel' }
  const screen = setup('dark'); expect(screen.getByTestId('submit-vk-auth').props.accessibilityState.disabled).toBe(true)
  expect(api.post).not.toHaveBeenCalled()
})
