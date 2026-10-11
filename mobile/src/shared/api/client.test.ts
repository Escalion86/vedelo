jest.mock('expo-application', () => ({
  getAndroidId: jest.fn(() => 'test-device'),
  nativeApplicationVersion: 'test',
}))
jest.mock('expo-device', () => ({ modelName: 'Jest Android' }))
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }))
jest.mock('../config/env', () => ({
  env: { apiBaseUrl: 'https://artistcrm.test/api' },
}))
jest.mock('../auth/tokenStore', () => ({
  clearAuthSession: jest.fn(),
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  setAuthSession: jest.fn(),
}))

import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  setAuthSession,
} from '../auth/tokenStore'
import type { AuthSession } from '../auth/types'
import { createApiClient } from './client'

const access = getAccessToken as jest.MockedFunction<typeof getAccessToken>
const refresh = getRefreshToken as jest.MockedFunction<typeof getRefreshToken>
const clear = clearAuthSession as jest.MockedFunction<typeof clearAuthSession>
const save = setAuthSession as jest.MockedFunction<typeof setAuthSession>

const response = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn(async () => body),
  }) as unknown as Response

const session: AuthSession = {
  accessToken: 'next-access',
  refreshToken: 'next-refresh',
  expiresIn: 900,
  tokenType: 'Bearer',
  user: {
    _id: 'user-id',
    tenantId: 'tenant-id',
    firstName: 'Анна',
    secondName: 'Иванова',
    phone: '79000000000',
    email: '',
    role: 'user',
    tariffId: null,
  },
}

describe('mobile api refresh policy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    access.mockResolvedValue('expired-access')
    refresh.mockResolvedValue('current-refresh')
    global.fetch = jest.fn()
  })

  it('сохраняет сессию и outbox при временной ошибке refresh', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        response(401, { error: { message: 'Access истёк' } })
      )
      .mockResolvedValueOnce(
        response(500, { error: { message: 'Сервер недоступен' } })
      )

    await expect(
      createApiClient().get('/mobile/v1/bootstrap')
    ).rejects.toMatchObject({
      status: 500,
      message: 'Сервер недоступен',
    })
    expect(clear).not.toHaveBeenCalled()
  })

  it('очищает отозванную сессию после подтверждённого 401 refresh', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        response(401, { error: { message: 'Access истёк' } })
      )
      .mockResolvedValueOnce(
        response(401, { error: { message: 'Сессия отозвана' } })
      )

    await expect(
      createApiClient().get('/mobile/v1/bootstrap')
    ).rejects.toMatchObject({
      status: 401,
    })
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('выходит из повреждённой локальной сессии без refresh token', async () => {
    refresh.mockResolvedValue(null)
    ;(global.fetch as jest.Mock).mockResolvedValueOnce(
      response(401, { error: { message: 'Access истёк' } })
    )

    await expect(
      createApiClient().get('/mobile/v1/bootstrap')
    ).rejects.toMatchObject({
      status: 401,
    })
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('вращает токены и повторяет исходный запрос один раз', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        response(401, { error: { message: 'Access истёк' } })
      )
      .mockResolvedValueOnce(response(200, { success: true, data: session }))
      .mockResolvedValueOnce(
        response(200, { success: true, data: { ready: true } })
      )

    await expect(
      createApiClient().get('/mobile/v1/bootstrap')
    ).resolves.toEqual({
      success: true,
      data: { ready: true },
    })
    expect(save).toHaveBeenCalledWith(session)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it('объединяет конкурентные 401 в один refresh-запрос', async () => {
    let resourceCalls = 0
    let refreshCalls = 0
    global.fetch = jest.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/mobile/v1/auth/refresh')) {
        refreshCalls += 1
        await Promise.resolve()
        return response(200, { success: true, data: session })
      }
      resourceCalls += 1
      return resourceCalls <= 2
        ? response(401, { error: { message: 'Access истёк' } })
        : response(200, { success: true, data: { ready: true } })
    }) as typeof fetch

    const api = createApiClient()
    await expect(
      Promise.all([
        api.get('/mobile/v1/bootstrap'),
        api.get('/mobile/v1/tasks'),
      ])
    ).resolves.toHaveLength(2)
    expect(refreshCalls).toBe(1)
    expect(resourceCalls).toBe(4)
    expect(save).toHaveBeenCalledTimes(1)
  })
})

it('платный photo POST с skipRefresh не повторяется после 401', async () => {
  jest.clearAllMocks()
  access.mockResolvedValue('expired-access')
  global.fetch = jest.fn().mockResolvedValue(response(401, { error: 'Не авторизован' }))
  await expect(createApiClient().post('/mobile/v1/events/ai-photo-draft', { image: 'data:image/png;base64,test' }, { skipRefresh: true })).rejects.toMatchObject({ status: 401 })
  expect(global.fetch).toHaveBeenCalledTimes(1)
  expect(refresh).not.toHaveBeenCalled()
})
