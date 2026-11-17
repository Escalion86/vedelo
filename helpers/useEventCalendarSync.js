'use client'

import { useCallback, useEffect, useRef } from 'react'
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'

const pollIntervalMs = 3000
const batchSize = 50
const pollers = new WeakMap()
const statusKey = (eventId) => ['eventCalendarSyncStatus', eventId]

const isOlder = (candidate, current) => {
  if (!current) return false
  const candidateVersion = Number(candidate?.syncVersion ?? 0)
  const currentVersion = Number(current.syncVersion ?? 0)
  if (candidateVersion !== currentVersion) return candidateVersion < currentVersion
  const candidateTime = Date.parse(candidate?.calendarSyncUpdatedAt) || 0
  const currentTime = Date.parse(current.calendarSyncUpdatedAt) || 0
  return candidateTime < currentTime
}

const applyCalendarStatus = (queryClient, status) => {
  if (!status?._id) return
  queryClient.setQueryData(statusKey(String(status._id)), (current) =>
    isOlder(status, current) ? current : status
  )
}

const createPoller = (queryClient) => {
  const visibleIds = new Map()
  let timer
  let polling = false

  const schedule = (delay) => {
    if (!visibleIds.size || timer || polling) return
    timer = setTimeout(poll, delay)
  }

  async function poll() {
    timer = undefined
    if (document.hidden) {
      schedule(pollIntervalMs)
      return
    }
    polling = true
    try {
      const ids = [...visibleIds.keys()]
      const requests = []
      for (let i = 0; i < ids.length; i += batchSize) {
        const params = new URLSearchParams({
          ids: ids.slice(i, i + batchSize).join(','),
        })
        requests.push(apiJson(`/api/events/calendar-sync?${params}`))
      }
      const results = await Promise.allSettled(requests)
      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value?.success || !Array.isArray(result.value.data)) continue
        for (const status of result.value.data) applyCalendarStatus(queryClient, status)
      }
    } finally {
      polling = false
      schedule(pollIntervalMs)
    }
  }

  return (eventId) => {
    visibleIds.set(eventId, (visibleIds.get(eventId) ?? 0) + 1)
    schedule(150)
    return () => {
      const observers = visibleIds.get(eventId) - 1
      if (observers > 0) visibleIds.set(eventId, observers)
      else visibleIds.delete(eventId)
      if (!visibleIds.size) {
        clearTimeout(timer)
        timer = undefined
      }
    }
  }
}

const watchVisibleEvent = (queryClient, eventId, indicator) => {
  if (!pollers.has(queryClient)) pollers.set(queryClient, createPoller(queryClient))
  const register = pollers.get(queryClient)
  if (!window.IntersectionObserver || !indicator) return register(eventId)

  let unregister
  const observer = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting) unregister ??= register(eventId)
    else {
      unregister?.()
      unregister = undefined
    }
  })
  observer.observe(indicator)

  return () => {
    observer.disconnect()
    unregister?.()
  }
}

export default function useEventCalendarSync(event) {
  const queryClient = useQueryClient()
  const eventId = event?._id ? String(event._id) : null
  const indicatorRef = useRef(null)
  const retryPending = useRef(false)
  const { data: remoteStatus } = useQuery({
    queryKey: statusKey(eventId),
    queryFn: skipToken,
  })
  const status = remoteStatus && !isOlder(remoteStatus, event) ? remoteStatus : event
  const pending = status?.calendarSyncStatus === 'pending'
  const errorCode = status?.calendarSyncError
  const failed = !pending && (status?.calendarSyncStatus === 'failed' || Boolean(errorCode))
  const canRetry = failed && errorCode !== 'calendar_sync_unavailable'

  useEffect(() => {
    if (eventId && pending) return watchVisibleEvent(queryClient, eventId, indicatorRef.current)
  }, [eventId, pending, queryClient])

  const retry = useCallback(async () => {
    if (!eventId || retryPending.current) return
    retryPending.current = true
    try {
      const payload = await apiJson(`/api/events/${eventId}/calendar-sync`, {
        method: 'POST',
      })
      if (payload?.success) applyCalendarStatus(queryClient, payload.data)
      else throw new Error('Не удалось повторить синхронизацию')
    } finally {
      retryPending.current = false
    }
  }, [eventId, queryClient])

  return { pending, failed, errorCode, indicatorRef, retry: canRetry ? retry : undefined }
}
