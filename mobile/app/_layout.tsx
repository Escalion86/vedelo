import { useEffect, useSyncExternalStore } from 'react'
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native'
import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router'
import { ThemeSystemUI } from '../src/shared/ui/ThemeSystemUI'
import NetInfo from '@react-native-community/netinfo'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppProviders } from '../src/shared/providers/AppProviders'
import { useAuth } from '../src/shared/auth/AuthProvider'
import { getDatabase } from '../src/shared/storage/database'
import { runSync } from '../src/shared/sync/syncEngine'
import {
  registerBackgroundSync,
  unregisterBackgroundSync,
} from '../src/shared/sync/backgroundSync'
import { useExpoPushNotifications } from '../src/shared/notifications/useExpoPushNotifications'
import { flushPendingLogout } from '../src/shared/auth/pendingLogout'
import { normalizeRegistrationReferrer } from '../src/shared/auth/registrationReferral'
import { useTheme, useThemeStyles } from '../src/shared/ui/ThemeProvider'
import type { Palette } from '../src/shared/ui/theme'
import { useDeviceProjection } from '../src/shared/native/useDeviceProjection'
import { useAppLock } from '../src/shared/auth/AppLockProvider'
import { pendingNativeIntent, subscribeNativeIntents } from '../src/shared/native/intents'

const RootNavigator = () => {
  const { palette } = useTheme()
  const styles = useThemeStyles(createStyles)
  const { authenticated, loading, onboardingRequired } = useAuth()
  const router = useRouter()
  const segments = useSegments()
  const params = useGlobalSearchParams<{ ref?: string }>()
  const referralId = normalizeRegistrationReferrer(params.ref)
  const { locked } = useAppLock()
  const pendingIntent = useSyncExternalStore(subscribeNativeIntents, pendingNativeIntent, pendingNativeIntent)
  useExpoPushNotifications(authenticated && !locked)
  useDeviceProjection()

  useEffect(() => {
    getDatabase().catch((error) =>
      console.warn('Не удалось открыть локальную базу', error)
    )
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      if (state.isConnected) flushPendingLogout().catch(() => undefined)
      if (authenticated && state.isConnected) runSync().catch(() => undefined)
    })
    const appStateSubscription = AppState.addEventListener(
      'change',
      (state) => {
        if (authenticated && state === 'active')
          runSync().catch(() => undefined)
      }
    )
    return () => {
      unsubscribeNetwork()
      appStateSubscription.remove()
    }
  }, [authenticated])

  useEffect(() => {
    if (loading) return
    const updateRegistration = authenticated
      ? registerBackgroundSync
      : unregisterBackgroundSync
    updateRegistration().catch(() => undefined)
  }, [authenticated, loading])

  useEffect(() => {
    if (loading) return
    const inAuthGroup = segments[0] === '(auth)'
    const inOnboarding = segments[0] === 'onboarding'
    if (!authenticated && !inAuthGroup) {
      router.replace({
        pathname: '/(auth)/login',
        params: referralId ? { mode: 'register', ref: referralId } : {},
      })
    }
    if (authenticated && onboardingRequired && !inOnboarding) {
      router.replace('/onboarding')
      return
    }
    if (authenticated && !onboardingRequired && (inAuthGroup || inOnboarding)) {
      router.replace(pendingIntent ? `/native/open?intent=${pendingIntent.key}` as never : '/(tabs)')
      return
    }
    if (authenticated && !onboardingRequired && !locked && pendingIntent && !pendingIntent.systemNavigation && segments.join('/') !== 'native/open') router.replace(`/native/open?intent=${pendingIntent.key}` as never)
  }, [
    authenticated,
    loading,
    onboardingRequired,
    router,
    segments,
    referralId,
    pendingIntent,
    locked,
  ])

  if (loading) {
    return (
      <View style={styles.loading}>
        <ThemeSystemUI />
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ThemeSystemUI />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.canvas },
        }}
      >
        <Stack.Screen name="history" options={{ presentation: 'modal' }} />
      </Stack>
    </View>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <RootNavigator />
      </AppProviders>
    </SafeAreaProvider>
  )
}

const createStyles = (palette: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.canvas,
  },
})
