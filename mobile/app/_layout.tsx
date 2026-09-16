import { useEffect } from 'react'
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native'
import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
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
import { colors } from '../src/shared/ui/theme'

const RootNavigator = () => {
  const { authenticated, loading, onboardingRequired } = useAuth()
  const router = useRouter()
  const segments = useSegments()
  const params = useGlobalSearchParams<{ ref?: string }>()
  const referralId = normalizeRegistrationReferrer(params.ref)
  useExpoPushNotifications(authenticated)

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
      router.replace('/(tabs)')
    }
  }, [
    authenticated,
    loading,
    onboardingRequired,
    router,
    segments,
    referralId,
  ])

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="history" options={{ presentation: 'modal' }} />
      </Stack>
    </>
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

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
})
