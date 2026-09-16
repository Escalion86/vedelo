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

type AuthContextValue = {
  loading: boolean
  onboardingLoading: boolean
  onboardingRequired: boolean
  user: MobileUser | null
  authenticated: boolean
  completeSignIn: (session: AuthSession) => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
  completeOnboarding: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<MobileUser | null>(null)
  const [onboardingLoading, setOnboardingLoading] = useState(false)
  const [onboardingRequired, setOnboardingRequired] = useState(false)

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
      return
    }
    let active = true
    setOnboardingLoading(true)
    api.get<{ success: true; data: { completed: boolean } }>(
      '/mobile/v1/onboarding'
    ).then((response) => {
      if (active) setOnboardingRequired(!response.data.completed)
    }).catch(() => {
      // A new account must still finish setup; an existing configured user can work offline.
      if (active) setOnboardingRequired(!user.firstName?.trim())
    }).finally(() => {
      if (active) setOnboardingLoading(false)
    })
    return () => { active = false }
  }, [user?._id])

  const completeOnboarding = useCallback(() => {
    setOnboardingRequired(false)
  }, [])

  const completeSignIn = useCallback(async (session: AuthSession) => {
    await flushPendingLogout()
    const previous = await getAuthSession()
    if (previous?.user.tenantId && previous.user.tenantId !== session.user.tenantId) {
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
      user,
      authenticated: Boolean(user),
      completeSignIn,
      signOut,
      refreshUser,
      completeOnboarding,
    }),
    [
      completeOnboarding,
      completeSignIn,
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
