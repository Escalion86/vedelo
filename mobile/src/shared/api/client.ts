import * as Application from 'expo-application'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { env } from '../config/env'
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  getAuthRevision,
  setAuthSession,
} from '../auth/tokenStore'
import type { AuthSession } from '../auth/types'
import { ApiError, parseApiError } from './errors'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  skipAuth?: boolean
  skipRefresh?: boolean
}

const buildUrl = (path: string) => {
  const base = env.apiBaseUrl.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizedPath}`
}

const getDeviceId = () => {
  try {
    return Platform.OS === 'android' ? Application.getAndroidId() : ''
  } catch {
    return ''
  }
}

const deviceHeaders = {
  'x-device-id': getDeviceId(),
  'x-device-name': Device.modelName || 'Android',
  'x-device-platform': Platform.OS,
  'x-app-version': Application.nativeApplicationVersion || 'development',
}

let refreshPromise: Promise<string | null> | null = null

const refreshAccessToken = async () => {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const revision = getAuthRevision()
    const refreshToken = await getRefreshToken()
    if (revision !== getAuthRevision()) throw new ApiError('Сессия изменилась. Повторите действие.', 401)
    if (!refreshToken) {
      await clearAuthSession()
      return null
    }
    const response = await fetch(buildUrl('/mobile/v1/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...deviceHeaders },
      body: JSON.stringify({ refreshToken }),
    })
    if (revision !== getAuthRevision()) throw new ApiError('Сессия изменилась. Повторите действие.', 401)
    if (!response.ok) {
      const error = await parseApiError(response)
      if (response.status === 401 && revision === getAuthRevision()) await clearAuthSession()
      throw error
    }
    const result = (await response.json()) as {
      success?: boolean
      data?: AuthSession
    }
    if (
      !result.success ||
      !result.data?.accessToken ||
      !result.data.refreshToken ||
      !result.data.user?._id
    ) {
      throw new ApiError('Сервер вернул некорректную mobile-сессию', 502)
    }
    if (revision !== getAuthRevision()) throw new ApiError('Сессия изменилась. Повторите действие.', 401)
    await setAuthSession(result.data)
    return result.data.accessToken
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

const parseResponse = async <TResponse>(response: Response) => {
  if (response.status === 204) return undefined as TResponse
  return (await response.json()) as TResponse
}
const assertRequestSession = (revision: number) => {
  if (revision !== getAuthRevision()) throw new ApiError('Сессия изменилась. Повторите действие.', 401)
}

export const createApiClient = () => {
  const request = async <TResponse>(
    path: string,
    options: RequestOptions = {},
    retry = true
  ): Promise<TResponse> => {
    const revision = getAuthRevision()
    const token = options.skipAuth ? null : await getAccessToken()
    if (!options.skipAuth) assertRequestSession(revision)
    const response = await fetch(buildUrl(path), {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...deviceHeaders,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
    if (!options.skipAuth) assertRequestSession(revision)

    if (
      response.status === 401 &&
      retry &&
      !options.skipAuth &&
      !options.skipRefresh
    ) {
      const nextToken = await refreshAccessToken()
      if (nextToken && await getAccessToken() === nextToken) return request<TResponse>(path, options, false)
    }

    if (!response.ok) throw await parseApiError(response)
    const data = await parseResponse<TResponse>(response)
    if (!options.skipAuth) assertRequestSession(revision)
    return data
  }

  return {
    request,
    get: <TResponse>(path: string, options?: Omit<RequestOptions, 'method'>) =>
      request<TResponse>(path, { ...options, method: 'GET' }),
    post: <TResponse>(
      path: string,
      body?: unknown,
      options?: Omit<RequestOptions, 'method' | 'body'>
    ) => request<TResponse>(path, { ...options, method: 'POST', body }),
    put: <TResponse>(
      path: string,
      body?: unknown,
      options?: Omit<RequestOptions, 'method' | 'body'>
    ) => request<TResponse>(path, { ...options, method: 'PUT', body }),
    patch: <TResponse>(
      path: string,
      body?: unknown,
      options?: Omit<RequestOptions, 'method' | 'body'>
    ) => request<TResponse>(path, { ...options, method: 'PATCH', body }),
    delete: <TResponse>(
      path: string,
      body?: unknown,
      options?: Omit<RequestOptions, 'method' | 'body'>
    ) => request<TResponse>(path, { ...options, method: 'DELETE', body }),
    upload: async <TResponse>(path: string, formData: FormData) => {
      const send = async (retry = true): Promise<TResponse> => {
        const revision = getAuthRevision()
        const token = await getAccessToken()
        assertRequestSession(revision)
        const response = await fetch(buildUrl(path), {
          method: 'POST',
          headers: {
            ...deviceHeaders,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        })
        assertRequestSession(revision)
        if (response.status === 401 && retry) {
          const nextToken = await refreshAccessToken()
          if (nextToken && await getAccessToken() === nextToken) return send(false)
        }
        if (!response.ok) throw await parseApiError(response)
        const data = await parseResponse<TResponse>(response)
        assertRequestSession(revision)
        return data
      }
      return send()
    },
    download: async (path: string) => {
      const send = async (retry = true): Promise<ArrayBuffer> => {
        const revision = getAuthRevision()
        const token = await getAccessToken()
        assertRequestSession(revision)
        const response = await fetch(buildUrl(path), {
          method: 'GET',
          headers: {
            ...deviceHeaders,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        assertRequestSession(revision)
        if (response.status === 401 && retry) {
          const nextToken = await refreshAccessToken()
          if (nextToken && await getAccessToken() === nextToken) return send(false)
        }
        if (!response.ok) throw await parseApiError(response)
        const data = await response.arrayBuffer()
        assertRequestSession(revision)
        return data
      }
      return send()
    },
  }
}

export const api = createApiClient()
