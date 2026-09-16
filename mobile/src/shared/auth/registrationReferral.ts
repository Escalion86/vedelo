import * as SecureStore from 'expo-secure-store'

const KEY = 'vedelo.registration.referrer'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export const normalizeRegistrationReferrer = (value: unknown): string =>
  typeof value === 'string' && /^[a-f\d]{24}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : ''

export const clearRegistrationReferrer = () => SecureStore.deleteItemAsync(KEY)

export const getRegistrationReferrer = async (): Promise<string> => {
  const raw = await SecureStore.getItemAsync(KEY)
  if (!raw) return ''
  try {
    const { referrerId, capturedAt } = JSON.parse(raw)
    const age = Date.now() - capturedAt
    if (Number.isFinite(age) && age >= 0 && age < MAX_AGE_MS)
      return normalizeRegistrationReferrer(referrerId)
  } catch {
    // A malformed or expired invitation must not block registration.
  }
  await clearRegistrationReferrer()
  return ''
}

export const captureRegistrationReferrer = async (value: unknown) => {
  const referrerId = normalizeRegistrationReferrer(value)
  if (!referrerId) return getRegistrationReferrer()
  await SecureStore.setItemAsync(
    KEY,
    JSON.stringify({ referrerId, capturedAt: Date.now() })
  )
  return referrerId
}
