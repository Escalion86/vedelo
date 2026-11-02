import { useEffect, useRef, useState } from 'react'
import { Text } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { getCachedEntity } from '../../src/shared/storage/cache'
import { getAuthSessionEpoch } from '../../src/shared/auth/tokenStore'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import { useAppLock } from '../../src/shared/auth/AppLockProvider'
import { performNotificationTaskAction } from '../../src/shared/notifications/taskActions'
import type { Event } from '../../src/shared/domain/types'
import type { TaskAction } from '../../src/shared/domain/taskActions'
import { Button, Notice, PageHeader, Screen, Surface } from '../../src/shared/ui/components'
import { useTheme } from '../../src/shared/ui/ThemeProvider'

const labels: Record<TaskAction, string> = { complete: 'Отметить выполненной', postpone_1: 'Перенести на завтра', postpone_3: 'Перенести на три дня' }
export default function NotificationTaskActionScreen() {
  const params = useLocalSearchParams<{ eventId?: string; taskId?: string; action?: string }>()
  const { authenticated } = useAuth(), { locked } = useAppLock(), { palette } = useTheme()
  const [event, setEvent] = useState<Event | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const alive = useRef(true), running = useRef(false), epoch = useRef(getAuthSessionEpoch())
  const action = typeof params.action === 'string' && Object.hasOwn(labels, params.action) ? params.action as TaskAction : null
  const eventId = typeof params.eventId === 'string' ? params.eventId : '', taskId = typeof params.taskId === 'string' ? params.taskId : ''
  const current = () => alive.current && epoch.current === getAuthSessionEpoch()
  useEffect(() => {
    alive.current = true
    if (authenticated && !locked && action && eventId) void getCachedEntity<Event>('events', eventId).then(value => {
      if (current()) { setEvent(value); if (!value) setError('Сначала откройте карточку и обновите данные задачи.') }
    }).catch(() => { if (current()) setError('Не удалось прочитать задачу.') })
    return () => { alive.current = false }
  }, [authenticated, locked, action, eventId])
  const task = event?.additionalEvents?.find(item => item._id === taskId)
  const apply = async () => {
    if (!authenticated || locked || !task || !action || running.current || !current()) return
    running.current = true; setBusy(true); setError('')
    try {
      await performNotificationTaskAction({ eventId, taskId, action })
      if (current()) router.replace(`/events/${eventId}` as never)
    } catch { if (current()) setError('Не удалось сохранить действие. Проверьте подключение и повторите.') }
    finally { running.current = false; if (current()) setBusy(false) }
  }
  return <Screen><PageHeader title="Действие с задачей" />
    {task && action ? <Surface><Text style={{ color: palette.text, fontWeight: '700' }}>{task.title || 'Следующий контакт'}</Text>
      <Notice message="Подтвердите действие для этой задачи. Изменение без сети будет отправлено после синхронизации." />
      <Button title={labels[action]} loading={busy} disabled={locked || !authenticated} onPress={() => void apply()} />
    </Surface> : <Notice tone="warning" message="Задача недоступна или удалена. Откройте карточку для проверки." />}
    {error ? <Notice tone="warning" message={error} /> : null}
    <Button title="Отмена" variant="secondary" disabled={busy} onPress={() => router.replace('/(tabs)')} />
  </Screen>
}
