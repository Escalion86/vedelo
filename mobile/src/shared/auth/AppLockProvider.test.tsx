import React from 'react'
import { AppState, Platform, Text, type AppStateStatus } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { AppLockProvider, useAppLock } from './AppLockProvider'
const mockAuthenticate = jest.fn(), mockPreference = jest.fn(), mockNativeLock = jest.fn(), mockReadLockSetting = jest.fn()
const mockConfirmNative = jest.fn(), mockNativeListener = jest.fn()
let mockNativeStatus: jest.Mock | undefined
let mockUser = { _id: 'a', tenantId: 'tenant-a' }
jest.mock('./AuthProvider', () => ({ useAuth: () => ({ authenticated: true, user: mockUser }) }))
jest.mock('expo-secure-store', () => ({ getItemAsync: () => mockReadLockSetting(), setItemAsync: jest.fn().mockResolvedValue(undefined) }))
jest.mock('expo-local-authentication', () => ({ authenticateAsync: (...args: unknown[]) => mockAuthenticate(...args) }))
jest.mock('../native/device', () => ({ deviceSession: () => ({ generation: mockUser._id }), device: { get getAppLockStatus() { return mockNativeStatus }, confirmAppAuthentication: (...args: unknown[]) => mockConfirmNative(...args), addListener: (...args: unknown[]) => mockNativeListener(...args), setPreference: (...args: unknown[]) => mockPreference(...args), setAppLockState: (...args: unknown[]) => mockNativeLock(...args) } }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }))
const Child = () => <Text testID="state">{useAppLock().locked ? 'locked' : 'open'}</Text>
const stateOf = (screen: ReturnType<typeof render>) => screen.getByTestId('state', { includeHiddenElements: true }).props.children
beforeEach(() => { jest.clearAllMocks(); mockNativeStatus = undefined; mockConfirmNative.mockReturnValue(true); mockNativeListener.mockReturnValue({ remove: jest.fn() }); jest.replaceProperty(Platform, 'OS', 'android'); mockUser = { _id: 'a', tenantId: 'tenant-a' }; mockAuthenticate.mockResolvedValue({ success: true }); mockPreference.mockResolvedValue(undefined); mockReadLockSetting.mockReset().mockResolvedValue('true'); jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() }) })
afterEach(() => jest.restoreAllMocks())
it('cold launch stays locked; cancel keeps it locked; system passcode fallback is enabled', async () => {
  mockAuthenticate.mockResolvedValueOnce({ success: false })
  const screen = render(<AppLockProvider><Child /></AppLockProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Разблокировать' }).props.accessibilityState.disabled).toBe(false))
  await act(async () => fireEvent.press(screen.getByText('Разблокировать')))
  expect(mockAuthenticate).toHaveBeenCalledTimes(1)
  expect(stateOf(screen)).toBe('locked')
  await act(async () => fireEvent.press(screen.getByText('Разблокировать')))
  await waitFor(() => expect(stateOf(screen)).toBe('open'))
  expect(mockAuthenticate).toHaveBeenCalledWith(expect.objectContaining({ disableDeviceFallback: false }))
  expect(mockNativeLock).toHaveBeenLastCalledWith('a', false)
})
it('hides in background immediately and requires authentication again after a minute', async () => {
  let listener!: (state: AppStateStatus) => void
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { if (_event === 'change') listener = callback; return { remove: jest.fn() } })
  let now = 1000
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now)
  const screen = render(<AppLockProvider><Child /></AppLockProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Разблокировать' }).props.accessibilityState.disabled).toBe(false))
  fireEvent.press(screen.getByText('Разблокировать'))
  await waitFor(() => expect(stateOf(screen)).toBe('open'))
  act(() => listener('background'))
  expect(stateOf(screen)).toBe('locked')
  now += 59_000; act(() => listener('active'))
  expect(stateOf(screen)).toBe('open')
  act(() => listener('background'))
  now += 60_000; act(() => listener('active'))
  expect(stateOf(screen)).toBe('locked')
  screen.unmount(); spy.mockRestore(); clock.mockRestore()
})
it('a late authentication result for another account cannot unlock the new session', async () => {
  let finish!: (value: { success: boolean }) => void
  mockAuthenticate.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const screen = render(<AppLockProvider><Child /></AppLockProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Разблокировать' }).props.accessibilityState.disabled).toBe(false))
  fireEvent.press(screen.getByText('Разблокировать'))
  mockUser = { _id: 'b', tenantId: 'tenant-b' }
  screen.rerender(<AppLockProvider><Child /></AppLockProvider>)
  await act(async () => finish({ success: true }))
  expect(stateOf(screen)).toBe('locked')
  expect(mockNativeLock).not.toHaveBeenCalledWith('b', false)
})
it('duplicate foreground events cannot expose native details while the app is locked', async () => {
  let listener!: (state: AppStateStatus) => void
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { if (_event === 'change') listener = callback; return { remove: jest.fn() } })
  let now = 1000
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  const screen = render(<AppLockProvider><Child /></AppLockProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Разблокировать' }).props.accessibilityState.disabled).toBe(false))
  fireEvent.press(screen.getByText('Разблокировать'))
  await waitFor(() => expect(stateOf(screen)).toBe('open'))
  act(() => listener('background'))
  now += 61_000
  act(() => { listener('active'); listener('active') })
  expect(stateOf(screen)).toBe('locked')
  expect(mockNativeLock).toHaveBeenLastCalledWith('a', true)
})
it('authentication finishing in background keeps native details hidden until foreground', async () => {
  let listener!: (state: AppStateStatus) => void
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { if (_event === 'change') listener = callback; return { remove: jest.fn() } })
  let finish!: (value: { success: boolean }) => void
  mockAuthenticate.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const screen = render(<AppLockProvider><Child /></AppLockProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Разблокировать' }).props.accessibilityState.disabled).toBe(false))
  fireEvent.press(screen.getByText('Разблокировать'))
  act(() => listener('background'))
  await act(async () => finish({ success: true }))
  expect(stateOf(screen)).toBe('locked')
  expect(mockNativeLock).toHaveBeenLastCalledWith('a', true)
  act(() => listener('active'))
  expect(stateOf(screen)).toBe('open')
  expect(mockNativeLock).toHaveBeenLastCalledWith('a', false)
})
it('foreground during a slow settings read cannot unlock native details before startup verification', async () => {
  let listener!: (state: AppStateStatus) => void, finish!: (value: string) => void
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { if (_event === 'change') listener = callback; return { remove: jest.fn() } })
  mockReadLockSetting.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const screen = render(<AppLockProvider><Child /></AppLockProvider>)
  act(() => listener('active'))
  expect(stateOf(screen)).toBe('locked')
  expect(mockNativeLock).not.toHaveBeenCalledWith('a', false)
  await act(async () => finish('true'))
  expect(stateOf(screen)).toBe('locked')
  expect(mockNativeLock).toHaveBeenLastCalledWith('a', true)
})
it('native screen-off timeout requires authentication without any AppState background event', async () => {
  let nativeChanged!: () => void
  mockNativeListener.mockImplementation((_name, listener) => { nativeChanged = listener; return { remove: jest.fn() } })
  mockNativeStatus = jest.fn().mockReturnValue({ generation: 'a', visible: true, requiresAuthentication: false })
  const screen = render(<AppLockProvider><Child /></AppLockProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Разблокировать' }).props.accessibilityState.disabled).toBe(false))
  fireEvent.press(screen.getByText('Разблокировать'))
  await waitFor(() => expect(stateOf(screen)).toBe('open'))
  // JavaScript was suspended during screen-off; native elapsedRealtime counted it.
  mockNativeStatus.mockReturnValue({ generation: 'a', visible: true, requiresAuthentication: true })
  act(() => { nativeChanged(); nativeChanged() })
  expect(stateOf(screen)).toBe('locked')
  expect(mockNativeLock).toHaveBeenLastCalledWith('a', true)
  mockAuthenticate.mockResolvedValueOnce({ success: false })
  fireEvent.press(screen.getByText('Разблокировать'))
  await waitFor(() => expect(mockAuthenticate).toHaveBeenCalledTimes(2))
  expect(mockConfirmNative).toHaveBeenCalledTimes(1)
  expect(stateOf(screen)).toBe('locked')
})
it('Android blur/focus protects a minute without a change in AppState', async () => {
  const listeners = new Map<string, () => void>()
  jest.spyOn(AppState, 'addEventListener').mockImplementation((name, listener) => { listeners.set(name, () => listener('active')); return { remove: jest.fn() } })
  let now = 1000
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  const screen = render(<AppLockProvider><Child /></AppLockProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Разблокировать' }).props.accessibilityState.disabled).toBe(false))
  fireEvent.press(screen.getByText('Разблокировать'))
  await waitFor(() => expect(stateOf(screen)).toBe('open'))
  act(() => listeners.get('blur')!())
  expect(stateOf(screen)).toBe('locked')
  now += 60_000
  act(() => { listeners.get('focus')!(); listeners.get('focus')!() })
  expect(stateOf(screen)).toBe('locked')
  expect(mockNativeLock).toHaveBeenLastCalledWith('a', true)
})
it('native authentication rejection cannot open the UI', async () => {
  mockConfirmNative.mockReturnValue(false)
  const screen = render(<AppLockProvider><Child /></AppLockProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Разблокировать' }).props.accessibilityState.disabled).toBe(false))
  fireEvent.press(screen.getByText('Разблокировать'))
  await waitFor(() => expect(mockConfirmNative).toHaveBeenCalled())
  expect(stateOf(screen)).toBe('locked')
  expect(mockNativeLock).not.toHaveBeenCalledWith('a', false)
})
