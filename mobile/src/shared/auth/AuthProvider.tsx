import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import { AppState } from 'react-native'
import { api } from '../api/client'
import {
  clearAuthSession,
  getAuthSession,
  getRefreshToken,
  setAuthSession,
  subscribeAuthSession,
} from './tokenStore'
import type { AuthSession, MobileUser } from './types'
import {
  flushPendingLogout,
  getPendingLogout,
  queuePendingLogout,
} from './pendingLogout'
import { clearLocalData } from '../storage/database'
import {
  setPushEnabledPreference,
  setStoredPushToken,
} from '../notifications/preferences'
import { clearPendingPushUnsubscribe } from '../notifications/pendingUnsubscribe'
import { clearRegistrationReferrer } from './registrationReferral'
import { readActivityOnboarding, type ActivityOnboarding, type ActivityProfile } from '../../features/onboarding/activityProfile'

type AuthContextValue = {
  loading: boolean
  onboardingLoading: boolean
  onboardingRequired: boolean
  activityOnboarding: ActivityOnboarding | null
  user: MobileUser | null
  authenticated: boolean
  completeSignIn: (session: AuthSession) => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
  completeOnboarding: () => void
  completeActivityProfile: (profile: ActivityProfile) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<MobileUser | null>(null)
  const [onboardingLoading, setOnboardingLoading] = useState(false)
  const [onboardingRequired, setOnboardingRequired] = useState(false)
  const [activityCheck, setActivityCheck] = useState<{ key: string; onboarding: ActivityOnboarding } | null>(null)
  const activityKey = user ? `${user._id}:${user.tenantId || ''}` : ''

  useEffect(() => {
    let active = true
    getPendingLogout()
      .then(async (pending) => {
        if (pending) {
          await Promise.all([
            clearAuthSession(),
            clearLocalData(),
            setPushEnabledPreference(false),
            setStoredPushToken(null),
            clearPendingPushUnsubscribe(),
          ])
          queryClient.clear()
          flushPendingLogout().catch(() => undefined)
          return null
        }
        return getAuthSession()
      })
      .then((session) => {
        if (active) {
          const sessionUser = session?.user || null
          setUser(sessionUser)
          setOnboardingRequired(
            Boolean(
              sessionUser &&
                !sessionUser.firstName?.trim()
            )
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [queryClient])

  useEffect(
    () =>
      subscribeAuthSession((nextUser) => {
        setUser(nextUser)
        if (!nextUser) {
          clearLocalData().catch(() => undefined)
          queryClient.clear()
        }
      }),
    [queryClient]
  )

  useEffect(() => {
    if (!user) {
      setOnboardingRequired(false)
      setOnboardingLoading(false)
      setActivityCheck(null)
      return
    }
    let active = true
    let checked = false
    let checking = false
    let requiredActivity = false
    const check = async () => {
      if (!active || (checked && !requiredActivity) || checking) return
      checking = true
      setOnboardingLoading(true)
      try {
        const onboarding = await readActivityOnboarding()
        if (active) {
          checked = true
          requiredActivity = onboarding.activityProfile?.required === true
          setOnboardingRequired(!onboarding.completed)
          setActivityCheck({ key: activityKey, onboarding })
        }
      } catch {
        // Existing users can keep working offline until the server confirms the new question is required.
        if (active && !checked) setOnboardingRequired(!user.firstName?.trim())
      } finally {
        checking = false
        if (active) setOnboardingLoading(false)
      }
    }
    void check()
    const unsubscribe = NetInfo.addEventListener(({ isConnected }) => {
      if (isConnected) void check()
    })
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void check() })
    return () => { active = false; unsubscribe(); appState.remove() }
  }, [activityKey])

  const completeOnboarding = useCallback(() => {
    setOnboardingRequired(false)
  }, [])

  const completeActivityProfile = useCallback((profile: ActivityProfile) => {
    setActivityCheck((current) => current?.key === activityKey
      ? { key: activityKey, onboarding: { ...current.onboarding, activityProfile: profile } }
      : current)
  }, [activityKey])

  const completeSignIn = useCallback(async (session: AuthSession) => {
    await flushPendingLogout()
    const previous = await getAuthSession()
    if (previous?.user && (previous.user._id !== session.user._id || previous.user.tenantId !== session.user.tenantId)) {
      await clearLocalData()
      queryClient.clear()
    }
    await setAuthSession(session)
    await clearRegistrationReferrer().catch(() => undefined)
    setUser(session.user)
    setOnboardingRequired(
      !session.user.firstName?.trim()
    )
  }, [queryClient])

  const signOut = useCallback(async () => {
    const refreshToken = await getRefreshToken()
    if (refreshToken) await queuePendingLogout(refreshToken)
    await clearAuthSession()
    await Promise.all([
      setPushEnabledPreference(false),
      setStoredPushToken(null),
      clearPendingPushUnsubscribe(),
    ])
    await clearLocalData()
    queryClient.clear()
    setUser(null)
    flushPendingLogout().catch(() => undefined)
  }, [queryClient])

  const refreshUser = useCallback(async () => {
    const response = await api.get<{ success: true; data: MobileUser }>(
      '/mobile/v1/auth/me'
    )
    const session = await getAuthSession()
    if (session) await setAuthSession({ ...session, user: response.data })
    setUser(response.data)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      onboardingLoading,
      onboardingRequired,
      activityOnboarding: activityCheck?.key === activityKey ? activityCheck.onboarding : null,
      user,
      authenticated: Boolean(user),
      completeSignIn,
      signOut,
      refreshUser,
      completeOnboarding,
      completeActivityProfile,
    }),
    [
      completeOnboarding,
      completeActivityProfile,
      completeSignIn,
      activityCheck,
      activityKey,
      loading,
      onboardingLoading,
      onboardingRequired,
      refreshUser,
      signOut,
      user,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
