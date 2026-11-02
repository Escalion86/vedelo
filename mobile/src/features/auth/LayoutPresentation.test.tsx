import React from 'react'
import { AppState, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { act, render, waitFor } from '@testing-library/react-native'
import RootLayout from '../../../app/_layout'
import { lightPalette, darkPalette } from '../../shared/ui/theme'
import { getDatabase } from '../../shared/storage/database'
import NetInfo from '@react-native-community/netinfo'
import { registerBackgroundSync, unregisterBackgroundSync } from '../../shared/sync/backgroundSync'
import { useExpoPushNotifications } from '../../shared/notifications/useExpoPushNotifications'
import { queueNativeIntent, resetNativeIntents } from '../../shared/native/intents'
import { redirectSystemPath } from '../../../app/+native-intent'
let mockMode: 'light' | 'dark' = 'light'
let mockAuth = { authenticated: false, loading: true, onboardingRequired: false }
let mockSegments = ['(auth)'], mockLocked = false
const mockReplace = jest.fn(), mockUnsubscribe = jest.fn()
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}))
jest.mock('../../shared/providers/AppProviders', () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => {
    const { ThemeProvider } = require('../../shared/ui/ThemeProvider')
    return <ThemeProvider forcedMode={mockMode} storage={null}>{children}</ThemeProvider>
  },
}))
jest.mock('../../shared/auth/AuthProvider', () => ({ useAuth: () => mockAuth }))
jest.mock('../../shared/auth/AppLockProvider', () => ({ useAppLock: () => ({ locked: mockLocked }) }))
jest.mock('../../shared/native/useDeviceProjection', () => ({ useDeviceProjection: jest.fn() }))
jest.mock('../../shared/storage/database', () => ({ getDatabase: jest.fn() }))
jest.mock('../../shared/sync/syncEngine', () => ({ runSync: jest.fn() }))
jest.mock('../../shared/sync/backgroundSync', () => ({ registerBackgroundSync: jest.fn(), unregisterBackgroundSync: jest.fn() }))
jest.mock('../../shared/auth/pendingLogout', () => ({ flushPendingLogout: jest.fn() }))
jest.mock('../../shared/auth/registrationReferral', () => ({ normalizeRegistrationReferrer: () => null }))
jest.mock('../../shared/notifications/useExpoPushNotifications', () => ({ useExpoPushNotifications: jest.fn() }))
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => mockUnsubscribe) }))
jest.mock('expo-status-bar', () => ({ StatusBar: ({ style }: { style: string }) => {
  const { View } = require('react-native'); return <View testID="root-statusbar" accessibilityLabel={style} />
} }))
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined) }))
jest.mock('expo-router', () => {
  const { View } = require('react-native')
  const Stack = ({ children, screenOptions }: any) => <View testID="root-stack" style={screenOptions.contentStyle}>{children}</View>
  Stack.Screen = () => null
  return { Stack, useRouter: () => ({ replace: mockReplace }), useSegments: () => mockSegments, useGlobalSearchParams: () => ({}) }
})
beforeEach(() => {
  jest.clearAllMocks(); mockAuth = { authenticated: false, loading: true, onboardingRequired: false }
  resetNativeIntents(); mockSegments = ['(auth)']; mockLocked = false
  ;(getDatabase as jest.Mock).mockResolvedValue({}); (registerBackgroundSync as jest.Mock).mockResolvedValue(undefined); (unregisterBackgroundSync as jest.Mock).mockResolvedValue(undefined)
})
it('keeps external navigation pending through sign-in, onboarding and app unlock', async () => {
  const intent = queueNativeIntent('/native/call-results')!
  mockAuth.loading = false; mockSegments = ['native', 'open']
  const screen = render(<RootLayout />)
  expect(mockReplace).toHaveBeenLastCalledWith({ pathname: '/(auth)/login', params: {} })
  mockAuth = { authenticated: true, loading: false, onboardingRequired: true }; mockSegments = ['(auth)']
  screen.rerender(<RootLayout />)
  expect(mockReplace).toHaveBeenLastCalledWith('/onboarding')
  mockAuth.onboardingRequired = false; mockSegments = ['(tabs)']; mockLocked = true; mockReplace.mockClear()
  screen.rerender(<RootLayout />); expect(mockReplace).not.toHaveBeenCalled()
  mockLocked = false; screen.rerender(<RootLayout />)
  await waitFor(() => expect(mockReplace).toHaveBeenLastCalledWith(`/native/open?intent=${intent.key}`))
  screen.unmount()
})
it('a warm system URL is navigated only by Expo; root resumes it only after sign-in', async () => {
  mockAuth = { authenticated: true, loading: false, onboardingRequired: false }; mockSegments = ['(tabs)']
  const screen = render(<RootLayout />)
  let destination = ''
  act(() => { destination = redirectSystemPath({ path: 'vedelo-dev://native/settings', initial: false }) })
  expect(destination).toMatch(/^\/native\/open\?intent=/)
  await act(async () => undefined)
  expect(mockReplace).not.toHaveBeenCalled()
  mockSegments = ['native', 'open']; screen.rerender(<RootLayout />)
  expect(mockReplace).not.toHaveBeenCalled()
  mockAuth.authenticated = false; screen.rerender(<RootLayout />)
  expect(mockReplace).toHaveBeenLastCalledWith({ pathname: '/(auth)/login', params: {} })
  mockSegments = ['(auth)']; mockAuth.authenticated = true; screen.rerender(<RootLayout />)
  expect(mockReplace).toHaveBeenLastCalledWith(destination)
  screen.unmount()
})
it.each(['light', 'dark'] as const)('%s: начальная загрузка и стек используют палитру; прежние подписки закрываются', async mode => {
  mockMode = mode
  const palette = mode === 'dark' ? darkPalette : lightPalette
  const remove = jest.fn(), subscription = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove })
  const screen = render(<RootLayout />)
  const spinner = screen.UNSAFE_root.findByProps({ size: 'large' })
  expect(spinner.props.color).toBe(palette.primary)
  expect(screen.UNSAFE_root.findAll((node: { props: { style?: StyleProp<ViewStyle> } }) => StyleSheet.flatten(node.props.style)?.backgroundColor === palette.canvas).length).toBeGreaterThan(0)
  expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1); expect(getDatabase).toHaveBeenCalledTimes(1)
  expect(useExpoPushNotifications).toHaveBeenCalledWith(false); expect(mockReplace).not.toHaveBeenCalled()
  expect(screen.getByTestId('root-statusbar').props.accessibilityLabel).toBe(mode === 'dark' ? 'light' : 'dark')
  mockAuth = { ...mockAuth, loading: false }; screen.rerender(<RootLayout />)
  await waitFor(() => expect(unregisterBackgroundSync).toHaveBeenCalledTimes(1))
  expect(StyleSheet.flatten(screen.getByTestId('root-stack').props.style).backgroundColor).toBe(palette.canvas)
  expect(screen.getByTestId('root-statusbar').props.accessibilityLabel).toBe(mode === 'dark' ? 'light' : 'dark')
  expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1)
  screen.unmount(); expect(mockUnsubscribe).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1)
  subscription.mockRestore()
})
