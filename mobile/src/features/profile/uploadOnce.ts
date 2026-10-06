import * as Application from 'expo-application'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { env } from '../../shared/config/env'
import { getAccessToken } from '../../shared/auth/tokenStore'
import { parseApiError } from '../../shared/api/errors'

// Non-idempotent uploads must never be replayed by the shared 401 refresh helper.
export async function uploadOnce<T>(path: string, form: FormData): Promise<T> {
  const token = await getAccessToken()
  const response = await fetch(`${env.apiBaseUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST', body: form,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-device-id': Platform.OS === 'android' ? Application.getAndroidId() || '' : '',
      'x-device-name': Device.modelName || 'Android', 'x-device-platform': Platform.OS,
      'x-app-version': Application.nativeApplicationVersion || 'development' },
  })
  if (!response.ok) throw await parseApiError(response)
  return response.json() as Promise<T>
}
