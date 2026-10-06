import { useCallback, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { useAuth } from '../../shared/auth/AuthProvider'

export const statusOf = (reason: unknown) => typeof reason === 'object' && reason !== null && 'status' in reason ? Number(reason.status) : 0
export const sectionError = (reason: unknown, fallback: string) => {
  const status = statusOf(reason)
  return status === 403 ? 'Нет доступа к разделу. Проверьте тариф и права.' : status === 401 ? 'Сессия завершена. Войдите снова.' : fallback
}

/** Reads are scoped to the current profile, filter and focus lifetime. Native
 * actions capture the same epoch; their locks live until the promise settles. */
export function useSectionData<T>(query: string, read: (signal: AbortSignal) => Promise<T>) {
  const { user } = useAuth()
  const key = JSON.stringify([user?._id, user?.tenantId, query])
  const life = useRef({ active: false, epoch: 0 })
  const request = useRef<AbortController | null>(null)
  const [state, setState] = useState<{ key: string; data: T | null; loading: boolean; error: string }>({ key: '', data: null, loading: true, error: '' })
  const token = useCallback(() => life.current.epoch, [])
  const current = useCallback((epoch: number) => life.current.active && life.current.epoch === epoch, [])
  const load = useCallback(async () => {
    if (!life.current.active || !user?._id) return
    request.current?.abort()
    const controller = new AbortController(); request.current = controller
    const epoch = ++life.current.epoch
    setState({ key, data: null, loading: true, error: '' })
    try {
      const data = await read(controller.signal)
      if (current(epoch)) setState({ key, data, loading: false, error: '' })
    } catch (reason) {
      if (current(epoch)) setState({ key, data: null, loading: false, error: sectionError(reason, 'Не удалось загрузить данные. Повторите попытку.') })
    }
  }, [key, read, current, user?._id])
  useFocusEffect(useCallback(() => {
    life.current.active = true
    void load()
    return () => { life.current.active = false; ++life.current.epoch; request.current?.abort() }
  }, [load]))
  const visible = state.key === key && Boolean(user?._id)
  return { data: visible ? state.data : null, loading: !visible || state.loading, error: visible ? state.error : '', load, token, current, key }
}
