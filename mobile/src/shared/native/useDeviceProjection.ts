import { useEffect } from 'react'
import { AppState } from 'react-native'
import type { Client, Event } from '../domain/types'
import { listCachedEntities, subscribeCacheChanges } from '../storage/cache'
import { useSyncRunState } from '../hooks/useSyncRunState'
import { getSyncRunState } from '../sync/syncState'
import { useAuth } from '../auth/AuthProvider'
import { device, deviceSession } from './device'
import { buildDeviceProjection } from './projection'

export function useDeviceProjection() {
  const { user, loading } = useAuth()
  const sync = useSyncRunState()
  useEffect(() => {
    if (loading || !user || !device) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let revision = 0
    const publish = async () => {
      const request = ++revision
      const captured = deviceSession()
      if (!active || !captured || captured.identity !== JSON.stringify([user._id, user.tenantId || user._id])) return
      const nativeRevision = device!.reserveProjectionRevision(captured.generation)
      const [clients, events, state] = await Promise.all([listCachedEntities<Client>('clients'), listCachedEntities<Event>('events'), getSyncRunState()])
      const json = JSON.stringify(buildDeviceProjection(clients, events, state.lastSuccessAt))
      if (active && request === revision && captured === deviceSession()) await device!.publishProjection(captured.generation, nativeRevision, json)
    }
    const unsubscribe = subscribeCacheChanges(type => {
      if (!['clients', 'events'].includes(type)) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { if (active) void publish().catch(() => undefined) }, 100)
    })
    void publish().catch(() => undefined)
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void publish().catch(() => undefined) })
    return () => { active = false; revision++; if (timer) clearTimeout(timer); unsubscribe(); listener.remove() }
  }, [loading, user?._id, user?.tenantId, sync?.lastSuccessAt])
}
