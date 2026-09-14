import type { ApiErrorShape } from './types'

export class ApiError extends Error {
  code?: string
  type?: string
  status: number
  field?: string

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const parseApiError = async (res: Response) => {
  const contentType = res.headers?.get?.('content-type') || ''
  const fallbackMessage =
    res.status === 404 && !contentType.includes('application/json')
      ? 'Мобильный API пока недоступен на сервере Ведело. Обновите сервер и повторите вход.'
      : res.status >= 500
        ? 'Сервер Ведело временно недоступен. Попробуйте ещё раз позже.'
        : `Сервер вернул ошибку HTTP ${res.status}`
  const fallback = new ApiError(fallbackMessage, res.status)

  try {
    const json = (await res.json()) as Partial<ApiErrorShape>
    const message = json?.error?.message || `HTTP ${res.status}`
    const err = new ApiError(message, res.status)
    err.code = json?.error?.code
    err.type = json?.error?.type || 'unknown'
    err.field = json?.error?.field
    return err
  } catch (error) {
    return fallback
  }
}
