import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { api } from '../../shared/api/client'
import { readStatus, responseData, safeError, unconfirmed, type GoogleStatus, type Provider, type ProviderStatus } from './integrationContract'

export class IntegrationCancelled extends Error {}
export type OperationGate = { owner: symbol | null }
type State = GoogleStatus | ProviderStatus
export type ResultNotice = { tone: 'success' | 'warning' | 'danger' | 'info'; message: string }
type Pending = { matches: (state: State) => boolean; message: string; tone?: ResultNotice['tone'] }

/** A form owns its epoch. Blur/close/unmount invalidates every outstanding read,
 * mutation and clipboard result. A shared gate also covers requests from a closed
 * form until they actually settle, including non-idempotent POSTs. */
export function useIntegrationSession(provider: Provider, externalGate?: OperationGate, onStatus?: (state: State) => void, onInactive?: () => void) {
  const ownGate = useRef<OperationGate>({ owner: null })
  const gate = externalGate || ownGate.current
  const lifetime = useRef({ active: false, epoch: 0 })
  const callbacks = useRef({ onStatus, onInactive })
  useEffect(() => { callbacks.current = { onStatus, onInactive } }, [onStatus, onInactive])
  const pending = useRef<Pending | null>(null)
  const [state, setState] = useState<State | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState<ResultNotice | null>(null)
  const [needsRead, setNeedsRead] = useState(false)
  const path = `/mobile/v1/integrations/${provider}`
  const token = useCallback(() => lifetime.current.epoch, [])
  const current = useCallback((epoch: number) => lifetime.current.active && lifetime.current.epoch === epoch, [])
  const publish = (next: State) => { setState(next); callbacks.current.onStatus?.(next) }

  const load = useCallback(async () => {
    if (!lifetime.current.active || gate.owner) return
    const owner = Symbol('read'); gate.owner = owner
    const epoch = lifetime.current.epoch
    setInitialLoading(true); setLoadError('')
    try {
      const next = readStatus(provider, await api.get(path))
      if (!lifetime.current.active || lifetime.current.epoch !== epoch) return
      setState(next); callbacks.current.onStatus?.(next)
      if (pending.current) {
        if (pending.current.matches(next)) {
          setNotice({ tone: pending.current.tone || 'success', message: pending.current.message })
          pending.current = null; setNeedsRead(false)
        } else setNotice({ tone: 'warning', message: unconfirmed })
      } else {
        // Unknown mutation outcome is never promoted to success by an arbitrary GET.
        setNeedsRead(false)
      }
    } catch (reason) {
      if (lifetime.current.active && lifetime.current.epoch === epoch) setLoadError(safeError(reason, 'Не удалось прочитать состояние интеграции.'))
    } finally {
      if (gate.owner === owner) gate.owner = null
      if (lifetime.current.active && lifetime.current.epoch === epoch) setInitialLoading(false)
    }
  }, [gate, path, provider])

  useFocusEffect(useCallback(() => {
    lifetime.current.active = true; ++lifetime.current.epoch
    pending.current = null; setState(null); setNotice(null); setNeedsRead(false)
    setWorking(false); setInitialLoading(false)
    void load()
    return () => {
      lifetime.current.active = false; ++lifetime.current.epoch
      pending.current = null; callbacks.current.onInactive?.()
    }
  }, [load]))

  const invalidate = () => {
    lifetime.current.active = false; ++lifetime.current.epoch
    pending.current = null; callbacks.current.onInactive?.()
  }

  const run = async <T,>(request: () => Promise<unknown>, receipt: (response: unknown) => T, expected: (receipt: T) => Pending, onReceipt?: (receipt: T) => void) => {
    if (!lifetime.current.active || gate.owner || needsRead) return
    const owner = Symbol('mutation'); gate.owner = owner
    const epoch = token()
    setWorking(true); setNotice(null); setLoadError('')
    let received = false
    try {
      const response = await request()
      if (!current(epoch)) return
      // Validate success even when the operation has no state DTO.
      responseData(response)
      const result = receipt(response)
      received = true
      onReceipt?.(result)
      const expectation = expected(result)
      pending.current = expectation; setNeedsRead(true)
      const next = readStatus(provider, await api.get(path))
      if (!current(epoch)) return
      publish(next)
      if (!expectation.matches(next)) throw new Error('READ_BACK_MISMATCH')
      pending.current = null; setNeedsRead(false)
      setNotice({ tone: expectation.tone || 'success', message: expectation.message })
    } catch (reason) {
      if (!current(epoch)) return
      if (reason instanceof IntegrationCancelled) {
        setNeedsRead(false); setNotice({ tone: 'info', message: 'Подключение отменено. Настройки не подтверждены.' })
      } else if (received) {
        setNeedsRead(true); setNotice({ tone: 'warning', message: unconfirmed })
      } else {
        // The request may have reached the server. Do not replay it after a lost
        // response; a user-triggered GET is the only next step.
        setNeedsRead(true)
        setNotice({ tone: 'warning', message: safeError(reason, unconfirmed) })
      }
    } finally {
      if (gate.owner === owner) gate.owner = null
      if (current(epoch)) setWorking(false)
    }
  }
  return { state, initialLoading, loadError, working, notice, needsRead, load, run, token, current, invalidate, setNotice, gate }
}
