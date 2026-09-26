'use client'

import { useEffect, useRef } from 'react'
import { readServerSyncDisabledFromStorage } from '@helpers/serverSyncMode'
import {
  appendServerSyncQueueItem,
  getReadyServerSyncQueueItems,
  getServerSyncQueueSummary,
  markServerSyncQueueItemConflict,
  markServerSyncQueueItemFailed,
  markServerSyncQueueItemSynced,
  markServerSyncQueueItemSyncing,
  readServerSyncQueue,
  replaceServerSyncQueue,
  SERVER_SYNC_FLUSH_NOW_EVENT,
  SERVER_SYNC_QUEUE_CHANGED_EVENT,
  updateServerSyncQueueItem,
} from '@helpers/serverSyncQueue'

const useServerSyncFetchGate = ({ serverSyncDisabled, snackbar }) => {
  const privacyWarningShownRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const nativeFetch = window.fetch.bind(window)

    const getMethod = (input, init) =>
      String(
        init?.method ??
          (typeof input === 'object' && input ? input.method : 'GET') ??
          'GET'
      ).toUpperCase()

    const normalizeBody = (body) => {
      if (!body) return ''
      if (typeof body === 'string') return body
      if (body instanceof URLSearchParams) return body.toString()
      if (body instanceof FormData) return '[form-data]'
      if (body instanceof Blob || body instanceof ArrayBuffer) return '[binary]'
      try {
        return JSON.stringify(body)
      } catch {
        return '[unserializable]'
      }
    }

    const normalizeHeaders = (headersValue) => {
      if (!headersValue) return {}
      if (headersValue instanceof Headers) {
        return Object.fromEntries(headersValue.entries())
      }
      if (Array.isArray(headersValue)) return Object.fromEntries(headersValue)
      if (typeof headersValue === 'object') return { ...headersValue }
      return {}
    }

    const hasReplayHeader = (headersValue) => {
      const headers = normalizeHeaders(headersValue)
      return Object.entries(headers).some(
        ([key, value]) =>
          key.toLowerCase() === 'x-artistcrm-sync-replay' &&
          String(value) === '1'
      )
    }

    const isQueueableWrite = (input, init) => {
      const method = getMethod(input, init)
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false
      if (hasReplayHeader(init?.headers)) return false

      const inputUrl =
        typeof input === 'string'
          ? input
          : typeof input?.url === 'string'
            ? input.url
            : ''
      if (!inputUrl) return false

      const url = new URL(inputUrl, window.location.origin)
      const isSameOriginApi =
        url.origin === window.location.origin &&
        url.pathname.startsWith('/api/')
      if (!isSameOriginApi || url.pathname.startsWith('/api/auth/'))
        return false
      return true
    }

    const queueWrite = (input, init, reason = '') => {
      const method = getMethod(input, init)
      const inputUrl =
        typeof input === 'string'
          ? input
          : typeof input?.url === 'string'
            ? input.url
            : ''
      const url = new URL(inputUrl, window.location.origin)

      try {
        appendServerSyncQueueItem({
          id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          url: `${url.pathname}${url.search}`,
          method,
          body: normalizeBody(init?.body),
          headers: normalizeHeaders(init?.headers),
          createdAt: new Date().toISOString(),
          lastError: reason,
        })
      } catch (error) {
        const message =
          error?.message === 'SERVER_SYNC_QUEUE_FULL'
            ? 'Очередь заполнена. Подключитесь к сети и повторите сохранение.'
            : 'Не удалось сохранить изменение на устройстве. Не закрывайте форму и повторите сохранение.'
        snackbar.error(message)
        throw new Error(message, { cause: error })
      }
    }

    const queuedResponse = () =>
      new Response(
        JSON.stringify({
          success: true,
          data: null,
          localOnly: true,
          queued: true,
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }
      )

    window.fetch = async (input, init = {}) => {
      const queueableWrite = isQueueableWrite(input, init)
      // Один ключ сохраняется с первой попытки, включая online-запрос,
      // ответ на который может потеряться до записи в offline-очередь.
      const inputUrl = typeof input === 'string' ? input : input?.url
      if (
        queueableWrite && getMethod(input, init) === 'POST' &&
        new URL(inputUrl, window.location.origin).pathname === '/api/clients'
      ) {
        const headers = new Headers(init.headers || input?.headers)
        if (!headers.has('Idempotency-Key')) {
          headers.set('Idempotency-Key', crypto.randomUUID())
        }
        init = { ...init, headers }
      }
      const disabledFromStorage = readServerSyncDisabledFromStorage()
      const disabled =
        typeof disabledFromStorage === 'boolean'
          ? disabledFromStorage
          : serverSyncDisabled

      if (queueableWrite && disabled) {
        queueWrite(input, init, 'server_sync_disabled')
        if (!privacyWarningShownRef.current) {
          snackbar.warning(
            'Серверная синхронизация отключена: запрос сохранен локально'
          )
          privacyWarningShownRef.current = true
        }
        return queuedResponse()
      }

      if (queueableWrite && navigator.onLine === false) {
        queueWrite(input, init, 'offline')
        snackbar.warning(
          'Нет сети: изменение сохранено и будет синхронизировано'
        )
        return queuedResponse()
      }

      try {
        return await nativeFetch(input, init)
      } catch (error) {
        if (!queueableWrite) throw error
        queueWrite(input, init, error?.message || 'network_error')
        snackbar.warning(
          'Нет связи: изменение сохранено и будет синхронизировано'
        )
        return queuedResponse()
      }
    }

    return () => {
      window.fetch = nativeFetch
    }
  }, [serverSyncDisabled, snackbar])
}

const useServerSyncQueueFlush = ({
  queryClient,
  serverSyncDisabled,
  snackbar,
}) => {
  const syncFlushInProgressRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let retryTimer
    let disposed = false
    const scheduleRetry = () => {
      window.clearTimeout(retryTimer)
      if (disposed || serverSyncDisabled || !navigator.onLine) return
      const retryTimes = readServerSyncQueue()
        .filter((item) => item.status === 'failed' && item.nextRetryAt)
        .map((item) => new Date(item.nextRetryAt).getTime())
        .filter(Number.isFinite)
      if (retryTimes.length === 0) return
      retryTimer = window.setTimeout(
        () => {
          flushQueue()
        },
        Math.max(0, Math.min(...retryTimes) - Date.now())
      )
    }

    const flushQueueUnlocked = async () => {
      if (disposed) return
      if (syncFlushInProgressRef.current) return
      if (serverSyncDisabled || !navigator.onLine) return

      const initialQueue = readServerSyncQueue()
      if (initialQueue.length === 0) return
      const initialSummary = getServerSyncQueueSummary(initialQueue)
      if (initialSummary.ready === 0) {
        scheduleRetry()
        return
      }

      syncFlushInProgressRef.current = true
      let queueProcessingCompleted = false
      try {
        let processed = 0
        let failed = 0
        let conflicts = 0

        while (true) {
          const queue = readServerSyncQueue()
          const item = getReadyServerSyncQueueItems(queue)[0]
          if (!item) break

          updateServerSyncQueueItem(item.id, (current) =>
            markServerSyncQueueItemSyncing(current)
          )

          const method = String(item?.method || 'POST').toUpperCase()
          const body =
            typeof item?.body === 'string' &&
            item.body !== '[form-data]' &&
            item.body !== '[binary]' &&
            item.body !== '[unserializable]'
              ? item.body
              : undefined
          const headers =
            item?.headers && typeof item.headers === 'object'
              ? { ...item.headers }
              : { 'Content-Type': 'application/json' }
          headers['x-artistcrm-sync-replay'] = '1'
          if (method === 'POST' && item.url?.split('?')[0] === '/api/clients') {
            const hasKey = Object.keys(headers).some(
              (name) => name.toLowerCase() === 'idempotency-key'
            )
            if (!hasKey) headers['Idempotency-Key'] = item.id
          }

          try {
            const response = await fetch(item.url, { method, headers, body })
            if (response.ok) {
              processed += 1
              updateServerSyncQueueItem(item.id, (current) =>
                markServerSyncQueueItemSynced(current)
              )
              continue
            }
            if (response.status === 409) {
              conflicts += 1
              updateServerSyncQueueItem(item.id, (current) =>
                markServerSyncQueueItemConflict(
                  current,
                  `HTTP ${response.status}`
                )
              )
              break
            }
            failed += 1
            updateServerSyncQueueItem(item.id, (current) =>
              markServerSyncQueueItemFailed(current, `HTTP ${response.status}`)
            )
            break
          } catch (error) {
            failed += 1
            updateServerSyncQueueItem(item.id, (current) =>
              markServerSyncQueueItemFailed(current, error)
            )
            break
          }
        }

        replaceServerSyncQueue(readServerSyncQueue())
        if (processed > 0) {
          queryClient.invalidateQueries()
          snackbar.success(`Синхронизировано локальных изменений: ${processed}`)
        }
        if (conflicts > 0) {
          snackbar.warning(
            'Есть конфликт синхронизации. Проверьте блок "Синхронизация".'
          )
        } else if (failed > 0) {
          snackbar.warning(
            'Не удалось синхронизировать часть очереди. Повторим позже.'
          )
        }
        queueProcessingCompleted = true
      } catch {
        snackbar.warning('Синхронизация очереди прервана')
      } finally {
        syncFlushInProgressRef.current = false
        // При ошибке localStorage не запускаем бесконечный цикл немедленных
        // повторов по просроченному nextRetryAt, который не удалось обновить.
        if (queueProcessingCompleted) scheduleRetry()
      }
    }

    // localStorage общий для всех вкладок. Локального ref недостаточно,
    // чтобы две вкладки не отправили один POST одновременно.
    const flushQueue = async () => {
      if (navigator.locks?.request) {
        await navigator.locks.request(
          'artistcrm-server-sync',
          { ifAvailable: true },
          async (lock) => {
            if (lock) await flushQueueUnlocked()
          }
        )
      } else {
        await flushQueueUnlocked()
      }
    }

    const handleFlush = () => {
      flushQueue()
    }
    window.addEventListener('online', handleFlush)
    window.addEventListener(SERVER_SYNC_FLUSH_NOW_EVENT, handleFlush)
    window.addEventListener(SERVER_SYNC_QUEUE_CHANGED_EVENT, handleFlush)
    flushQueue()

    return () => {
      disposed = true
      window.clearTimeout(retryTimer)
      window.removeEventListener('online', handleFlush)
      window.removeEventListener(SERVER_SYNC_FLUSH_NOW_EVENT, handleFlush)
      window.removeEventListener(SERVER_SYNC_QUEUE_CHANGED_EVENT, handleFlush)
    }
  }, [queryClient, serverSyncDisabled, snackbar])
}

const useServerSync = (options) => {
  useServerSyncFetchGate(options)
  useServerSyncQueueFlush(options)
}

export default useServerSync
