import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState } from 'react-native'
import { useNetInfo } from '@react-native-community/netinfo'
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { getAuthSessionEpoch } from '../../shared/auth/tokenStore'
import type { Event } from '../../shared/domain/types'
import { useCachedEntities } from '../../shared/hooks/useCachedEntities'
import { subscribeCacheChanges } from '../../shared/storage/cache'

type CalendarStatus = Pick<Event, '_id' | 'calendarSyncStatus' | 'calendarSyncError' | 'calendarSyncUpdatedAt' | 'syncVersion'>
type StatusById = Record<string, CalendarStatus>

const calendarStatusKey = () => ['event-calendar-sync-status', getAuthSessionEpoch()] as const
const version = (event: CalendarStatus) => event.syncVersion ?? 1
const time = (event: CalendarStatus) => Date.parse(event.calendarSyncUpdatedAt || '') || 0

const compareStatus = (candidate: CalendarStatus, saved: CalendarStatus) =>
  version(candidate) - version(saved) || time(candidate) - time(saved)

export const getCalendarSyncInfo = (event: Event & { isDemo?: boolean }, readback?: CalendarStatus) => {
  const serverEvent = !event.isDemo && !event._id.startsWith('local-') && (!event.syncStatus || event.syncStatus === 'synced')
  const latest = readback?._id === event._id && compareStatus(readback, event) >= 0 ? readback : event
  const error = latest.calendarSyncError || ''
  if (!serverEvent) return { status: '', error: '' } as const
  if (latest.calendarSyncStatus === 'pending') return { status: 'pending', error: '' } as const
  return { status: latest.calendarSyncStatus === 'failed' || error ? 'failed' : '', error } as const
}

export const calendarSyncLabel = (status: ReturnType<typeof getCalendarSyncInfo>['status']) =>
  status === 'pending' ? 'Синхронизация с Google Календарём' : status === 'failed' ? 'Ошибка календаря' : ''

export const needsCalendarSettings = (error: string) =>
  error === 'calendar_sync_connection_required' || error === 'calendar_sync_unavailable'

export const useCalendarSyncInfo = (event: Event & { isDemo?: boolean }) => {
  const readback = useQuery<StatusById, Error, CalendarStatus | undefined>({
    queryKey: calendarStatusKey(),
    queryFn: skipToken,
    select: useCallback((statuses: StatusById) => statuses[event._id], [event._id]),
  })
  return getCalendarSyncInfo(event, readback.data)
}

export const useCalendarSyncPolling = () => {
  const client = useQueryClient()
  const events = useCachedEntities<Event>('events')
  const { isConnected, isInternetReachable } = useNetInfo()
  const [foreground, setForeground] = useState(() => AppState.currentState === 'active')
  const queryKey = calendarStatusKey()
  const { data: statuses } = useQuery<StatusById>({ queryKey, queryFn: skipToken })

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setForeground(state === 'active'))
    return () => listener.remove()
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribeCacheChanges((type) => {
      if (type !== 'events') return
      clearTimeout(timer)
      timer = setTimeout(() => void client.invalidateQueries({ queryKey: ['cached-entities', 'events'] }), 100)
    })
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [client])

  const ids = events.data?.filter((event) => getCalendarSyncInfo(event, statuses?.[event._id]).status === 'pending')
    .map((event) => event._id).sort().join(',') ?? ''
  const epoch = getAuthSessionEpoch()
  const enabled = foreground && isConnected === true && isInternetReachable !== false && Boolean(ids)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const current = () => !controller.signal.aborted && getAuthSessionEpoch() === epoch
    const poll = async () => {
      const key = calendarStatusKey()
      const snapshot = client.getQueryData<StatusById>(key)
      const pendingIds = ids.split(',')
      let delay = 3000
      try {
        for (let index = 0; index < pendingIds.length && current(); index += 50) {
          const batch = pendingIds.slice(index, index + 50)
          const result = await api.get<{ success: boolean; data: CalendarStatus[] }>(
            `/events/calendar-sync?ids=${encodeURIComponent(batch.join(','))}`, { signal: controller.signal }
          )
          if (!current()) return
          if (!result.success || !Array.isArray(result.data)) throw new Error('Не удалось прочитать состояние синхронизации')
          client.setQueryData<StatusById>(key, (saved) => {
            const next = { ...saved }
            for (const status of result.data) {
              if (!batch.includes(status?._id)) continue
              const previous = saved?.[status._id]
              // A retry may have updated the status while this read was in flight.
              const order = previous ? compareStatus(status, previous) : 1
              if (order > 0 || (order === 0 && snapshot?.[status._id] === previous))
                next[status._id] = status
            }
            return next
          })
        }
      } catch {
        delay = 10_000
      }
      if (current()) timer = setTimeout(() => void poll(), delay)
    }
    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [client, enabled, epoch, ids])
}

export const useRetryCalendarSync = (eventId: string) => {
  const client = useQueryClient()
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const epoch = getAuthSessionEpoch()
  const retry = async () => {
    if (running.current || epoch !== getAuthSessionEpoch()) return
    running.current = true
    setBusy(true)
    const key = calendarStatusKey()
    try {
      const response = await api.post<{ success: boolean; data: CalendarStatus }>(`/events/${encodeURIComponent(eventId)}/calendar-sync`)
      if (epoch !== getAuthSessionEpoch()) return
      if (!response.success || response.data?._id !== eventId) throw new Error('Некорректный статус заказа')
      client.setQueryData<StatusById>(key, (saved) => {
        const previous = saved?.[eventId]
        return !previous || compareStatus(response.data, previous) >= 0 ? { ...saved, [eventId]: response.data } : saved
      })
    } catch {
      if (epoch === getAuthSessionEpoch())
        Alert.alert('Google Календарь', 'Не удалось запустить синхронизацию. Проверьте подключение в разделе «Интеграции» и попробуйте ещё раз.')
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return { busy, retry }
}
