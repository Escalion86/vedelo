import * as SecureStore from 'expo-secure-store'
import type { AuthSession } from './types'
import { activateDeviceSession, clearDeviceSession } from '../native/device'
import { resetNativeIntents, setNativeIntentIdentity } from '../native/intents'

const ACCESS_TOKEN_KEY = 'artistcrm_access_token'
const REFRESH_TOKEN_KEY = 'artistcrm_refresh_token'
const USER_KEY = 'artistcrm_mobile_user'
const LEGACY_TOKEN_KEY = 'artistcrm_auth_token'
const listeners = new Set<(user: AuthSession['user'] | null) => void>()
let authRevision = 0
let sessionEpoch = 0
let sessionIdentity = ''
const identityOf = (user: AuthSession['user']) => JSON.stringify([user._id, user.tenantId || user._id])
const setIdentity = (identity: string) => { if (identity !== sessionIdentity) { sessionIdentity = identity; sessionEpoch++ }; setNativeIntentIdentity(identity || null) }
export const getAuthSessionEpoch = () => sessionEpoch
let clearing = false
let authWrites: Promise<unknown> = Promise.resolve()
export const getAuthRevision = () => authRevision
const writeAuth = (work: () => Promise<void>) => {
  const result = authWrites.then(work)
  authWrites = result.catch(() => undefined)
  return result
}

const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

export const getAccessToken = async () => {
  await authWrites
  if (clearing) return null
  const current = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
  if (current) return current
  return SecureStore.getItemAsync(LEGACY_TOKEN_KEY)
}

export const getRefreshToken = async () => { await authWrites; return clearing ? null : SecureStore.getItemAsync(REFRESH_TOKEN_KEY) }

export const getStoredUser = async (): Promise<AuthSession['user'] | null> => {
  await authWrites
  if (clearing) return null
  const raw = await SecureStore.getItemAsync(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthSession['user']
  } catch {
    return null
  }
}

export const getAuthSession = async (): Promise<AuthSession | null> => {
  const revision = authRevision
  if (clearing) return null
  const [accessToken, refreshToken, user] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
    getStoredUser(),
  ])
  if (revision !== authRevision || clearing) return null
  if (!accessToken || !user) { setIdentity(''); await clearDeviceSession(true); return null }
  setIdentity(identityOf(user))
  await activateDeviceSession(user)
  if (revision !== authRevision || clearing) return null
  return {
    accessToken,
    refreshToken: refreshToken || '',
    expiresIn: 0,
    tokenType: 'Bearer',
    user,
  }
}

export const setAuthSession = async (session: AuthSession) => {
  const revision = ++authRevision
  clearing = false
  setIdentity(identityOf(session.user))
  await activateDeviceSession(session.user)
  await writeAuth(async () => {
    if (revision !== authRevision) return
    await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken, secureOptions),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken, secureOptions),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user), secureOptions),
    SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY),
    ])
    if (revision === authRevision) listeners.forEach((listener) => listener(session.user))
  })
}

export const clearAuthSession = async () => {
  const revision = ++authRevision
  clearing = true
  sessionIdentity = ''; sessionEpoch++
  resetNativeIntents()
  await clearDeviceSession()
  await writeAuth(async () => {
    if (revision !== authRevision) return
    await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
    SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY),
    ])
    if (revision === authRevision) { clearing = false; listeners.forEach((listener) => listener(null)) }
  })
}

export const subscribeAuthSession = (
  listener: (user: AuthSession['user'] | null) => void
) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Compatibility exports for the initial scaffold.
export const getAuthToken = getAccessToken
export const setAuthToken = (token: string) =>
  SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token, secureOptions)
export const clearAuthToken = clearAuthSession
