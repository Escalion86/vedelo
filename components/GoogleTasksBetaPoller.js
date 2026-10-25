'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export default function GoogleTasksBetaPoller() {
  const client = useQueryClient()
  useEffect(() => {
    let stopped = false
    let timer
    const poll = async () => {
      try {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          const status = await (await fetch('/api/google-calendar/status')).json()
          if (!stopped && status.data?.tasksBeta?.enabled && status.data?.enabled && status.data?.allowCalendarSync) {
            const result = await (await fetch('/api/google-calendar/tasks-beta', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }),
            })).json()
            if (result.data?.changed) {
              await Promise.all([client.invalidateQueries({ queryKey: ['events'] }), client.invalidateQueries({ queryKey: ['event'] })])
            }
          }
        }
      } catch { /* Retried on the next foreground tick; details are in integration settings. */ }
      if (!stopped) timer = setTimeout(poll, 60000)
    }
    timer = setTimeout(poll, 10000)
    return () => { stopped = true; clearTimeout(timer) }
  }, [client])
  return null
}
