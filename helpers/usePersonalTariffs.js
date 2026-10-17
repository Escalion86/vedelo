'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export default function usePersonalTariffs(userId) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const url = `/api/billing/preferences${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`
  useEffect(() => {
    const controller = new AbortController()
    fetch(url, { signal: controller.signal, cache: 'no-store' })
      .then(async (res) => {
        const payload = await res.json()
        if (!res.ok)
          throw new Error(payload.error || 'Не удалось загрузить тарифы')
        setData(payload.data)
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message)
      })
    return () => controller.abort()
  }, [url])
  const mutate = useCallback(
    async (body) => {
      if (lock.current) return false
      lock.current = true
      setBusy(true)
      setError('')
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const payload = await res.json()
        if (!res.ok)
          throw new Error(payload.error || 'Не удалось сохранить изменения')
        setData(payload.data)
        return true
      } catch (reason) {
        setError(reason.message || 'Не удалось сохранить изменения')
        return false
      } finally {
        lock.current = false
        setBusy(false)
      }
    },
    [url]
  )
  return { data, error, busy, mutate }
}
