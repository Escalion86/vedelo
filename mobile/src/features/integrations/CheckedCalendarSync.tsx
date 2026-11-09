import { useEffect, useRef, useState } from 'react'
import { api } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import { useAuth } from '../../shared/auth/AuthProvider'
import { getAuthSessionEpoch } from '../../shared/auth/tokenStore'
import { getCachedEntity, removeCachedEntity, upsertEntities } from '../../shared/storage/cache'
import { assertLocalDataEpoch, localDataEpoch, withLocalEntityWrite } from '../../shared/storage/localEntityCoordination'
import { Button, Notice, SectionTitle, Surface } from '../../shared/ui/components'

const collection = '__google_checked_sync'
const endpoint = '/events/google-sync-checked'
type Item = { _id: string; title: string }
type Queue = { _id: string; connectionKey: string; items: Item[]; completed: string[]; failed: string[] }
type ListResult = { success: boolean; data?: { connectionKey: string; events: Item[] } }

export function CheckedCalendarSync({ disabled }: { disabled: boolean }) {
  const { user } = useAuth()
  const identity = user?._id ? JSON.stringify([user._id, user.tenantId || user._id]) : ''
  return identity ? <SessionSync key={identity} identity={identity} disabled={disabled} /> : null
}

function SessionSync({ identity, disabled }: { identity: string; disabled: boolean }) {
  const [queue, setQueue] = useState<Queue | null>(null)
  const [preview, setPreview] = useState<Queue | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [attempt, setAttempt] = useState(0)
  const lock = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    const epoch = getAuthSessionEpoch()
    setReady(false)
    getCachedEntity<Queue>(collection, identity).then(value => {
      if (!controller.signal.aborted && getAuthSessionEpoch() === epoch) { setQueue(value); setReady(true) }
    }).catch(() => {
      if (!controller.signal.aborted && getAuthSessionEpoch() === epoch) setNotice('Не удалось прочитать сохранённую синхронизацию.')
    })
    return () => controller.abort()
  }, [identity, attempt])

  const run = async (work: (context: { signal: AbortSignal; check: () => void; persist: (value: Queue | null) => Promise<void> }) => Promise<void>) => {
    if (lock.current || disabled || !ready || !lifetime.current) return
    const { signal } = lifetime.current
    const epoch = localDataEpoch(), session = getAuthSessionEpoch()
    const check = () => {
      assertLocalDataEpoch(epoch)
      if (signal.aborted || session !== getAuthSessionEpoch()) throw Error('SESSION_CHANGED')
    }
    const persist = async (value: Queue | null) => {
      await withLocalEntityWrite(async () => {
        check()
        if (value) await upsertEntities(collection, [value])
        else await removeCachedEntity(collection, identity)
      })
      check()
      setQueue(value)
    }
    lock.current = true
    setBusy(true)
    setNotice('')
    try { check(); await work({ signal, check, persist }) }
    catch {
      if (!signal.aborted && session === getAuthSessionEpoch()) setNotice('Не удалось завершить синхронизацию. Проверьте подключение Google Calendar и сеть.')
    } finally {
      lock.current = false
      if (!signal.aborted && session === getAuthSessionEpoch()) setBusy(false)
    }
  }
  const load = async (signal: AbortSignal) => {
    const result = await api.get<ListResult>(endpoint, { signal })
    if (result.success !== true || !result.data?.connectionKey || !Array.isArray(result.data.events)) throw Error('Unconfirmed')
    return result.data
  }
  const execute = (initial: Queue) => run(async ({ signal, check, persist }) => {
    const current = await load(signal)
    check()
    if (current.connectionKey !== initial.connectionKey) {
      setNotice('Подключение календаря изменилось. Отмените сохранённую операцию и подготовьте новый список.')
      return
    }
    const eligible = new Set(current.events.map(item => item._id))
    let next = initial
    await persist(next)
    setPreview(null)
    for (const item of initial.items) {
      if (initial.completed.includes(item._id)) continue
      check()
      let confirmed = false
      if (eligible.has(item._id)) {
        try {
          const result = await api.post<{ success: boolean; data?: { eventId: string } }>(endpoint, { eventId: item._id, connectionKey: initial.connectionKey }, { signal })
          confirmed = result.success === true && result.data?.eventId === item._id
        } catch (error) {
          check()
          if (error instanceof ApiError && error.status === 409) {
            setNotice('Подключение календаря изменилось. Отмените сохранённую операцию и подготовьте новый список.')
            return
          }
          if (!(error instanceof ApiError) || error.status === 401 || error.status === 403 || error.status === 429) throw error
        }
      }
      next = { ...next, completed: confirmed ? [...next.completed, item._id] : next.completed,
        failed: [...next.failed.filter(id => id !== item._id), ...(!confirmed ? [item._id] : [])] }
      await persist(next)
    }
    setNotice(`Синхронизировано ${next.completed.length} из ${next.items.length}. Ошибок ${next.failed.length}.`)
    if (!next.failed.length) await persist(null)
  })

  return <Surface>
    <SectionTitle>Массовая синхронизация</SectionTitle>
    {notice ? <Notice message={notice} /> : null}
    {!ready && notice ? <Button title="Повторить чтение" variant="secondary" onPress={() => { setNotice(''); setAttempt(n => n + 1) }} /> : null}
    {!queue && !preview ? <Button title="Подготовить отмеченные работы" variant="secondary" loading={busy} disabled={disabled || !ready} onPress={() => void run(async ({ signal, check }) => {
      const result = await load(signal)
      check()
      if (!result.events.length) { setNotice('Нет отмеченных работ для синхронизации.'); return }
      setPreview({ _id: identity, connectionKey: result.connectionKey, items: result.events, completed: [], failed: [] })
    })} /> : null}
    {preview ? <>
      <Notice message={`Отмеченных работ ${preview.items.length}. Подтвердите отправку в Google Calendar.`} />
      <Button title="Синхронизировать" loading={busy} disabled={disabled} onPress={() => void execute(preview)} />
      <Button title="Отмена" variant="secondary" disabled={busy} onPress={() => setPreview(null)} />
    </> : null}
    {queue ? <>
      <Notice message={`Обработано ${queue.completed.length + queue.failed.length} из ${queue.items.length}. Ошибок ${queue.failed.length}.`} />
      {!preview ? <Button title={queue.failed.length ? 'Повторить ошибки' : 'Продолжить синхронизацию'} loading={busy} disabled={disabled} onPress={() => void execute(queue)} /> : null}
      <Button title="Отменить сохранённую операцию" variant="secondary" disabled={busy || disabled} onPress={() => void run(({ persist }) => persist(null))} />
    </> : null}
  </Surface>
}
