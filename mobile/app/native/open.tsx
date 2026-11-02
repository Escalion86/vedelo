import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { api } from '../../src/shared/api/client'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import { useAppLock } from '../../src/shared/auth/AppLockProvider'
import { getAuthSessionEpoch } from '../../src/shared/auth/tokenStore'
import { getCachedEntity, publishEntityReadback } from '../../src/shared/storage/cache'
import { pendingNativeIntent, subscribeNativeIntents, clearNativeIntent } from '../../src/shared/native/intents'
import { Button, Notice, PageHeader, Screen } from '../../src/shared/ui/components'

export default function NativeOpenScreen() {
  const { intent: routeIntent } = useLocalSearchParams<{ intent?: string }>()
  const { authenticated, loading, onboardingRequired } = useAuth(), { locked } = useAppLock()
  const intent = useSyncExternalStore(subscribeNativeIntents, pendingNativeIntent, pendingNativeIntent)
  const [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  const navigating = useRef(false)
  useEffect(() => {
    if (!authenticated || loading || onboardingRequired || locked) return
    if (!intent) { if (!navigating.current) router.replace('/(tabs)'); return }
    // A second system URL can arrive while this gate is already open/locked.
    // Wait for Expo's route update before consuming it; otherwise its delayed
    // navigation would mount an empty gate after we opened the destination.
    if (intent.systemNavigation && String(intent.key) !== routeIntent) return
    navigating.current = false
    let alive = true
    const epoch = getAuthSessionEpoch()
    const current = () => alive && epoch === getAuthSessionEpoch() && pendingNativeIntent()?.key === intent.key
    setError('')
    void (async () => {
      const entity = intent.destination.entity
      if (entity) {
        const cached = await getCachedEntity(entity.kind, entity.id)
        if (!current()) return
        if (entity.id.startsWith('local-')) {
          if (!cached) throw new Error('Запись больше недоступна на этом устройстве.')
        } else {
          try {
            const response = await api.get<{ data: { _id: string; syncStatus?: string } }>(`/mobile/v1/${entity.kind}/${entity.id}`)
            if (!current()) return
            if (response.data?._id !== entity.id) throw Object.assign(new Error('Не удалось проверить запись.'), { status: 409 })
            if (!cached) await publishEntityReadback(entity.kind, response.data, current, () => {}, { allowMissing: true })
          } catch (reason) {
            const status = (reason as { status?: number }).status
            if ([401, 403, 404].includes(status || 0)) throw new Error('Запись удалена или недоступна этому аккаунту.')
            if (!cached || status && status < 500) throw reason
            // Only the account's encrypted local copy can be opened while offline.
          }
        }
      }
      if (current()) { navigating.current = true; clearNativeIntent(intent.key); router.replace(intent.destination.href as never) }
    })().catch(() => { if (current()) setError('Не удалось открыть запись. Проверьте доступ и подключение к интернету.') })
    return () => { alive = false }
  }, [authenticated, loading, onboardingRequired, locked, intent, routeIntent, attempt])
  return <Screen><PageHeader title="Открываем Ведело" />
    <Notice tone={error ? 'warning' : 'info'} message={error || 'Проверяем доступ…'} />
    {error ? <Button title="Повторить" onPress={() => setAttempt(value => value + 1)} /> : null}
    <Button title="Открыть главную" variant="secondary" onPress={() => { clearNativeIntent(); router.replace('/(tabs)') }} />
  </Screen>
}
