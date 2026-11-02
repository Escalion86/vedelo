import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, PermissionsAndroid, Platform } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Button, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../src/shared/ui/components'
import { device as nativeDevice, type DeviceStatus } from '../../src/shared/native/device'
import { useAppLock } from '../../src/shared/auth/AppLockProvider'

export default function AndroidSettingsScreen() {
  const device = nativeDevice
  const appLock = useAppLock()
  const [status, setStatus] = useState<DeviceStatus | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const refresh = useCallback(async () => { if (device) setStatus(await device.getStatus()) }, [])
  useFocusEffect(useCallback(() => { void refresh().catch(() => setError('Не удалось прочитать настройки Android')) }, [refresh]))
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh().catch(() => undefined) })
    return () => listener.remove()
  }, [refresh])
  const action = async (work: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true); setError('')
    try { await work(); await refresh() } catch { setError('Не удалось выполнить действие. Проверьте разрешения Android.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <Screen><PageHeader title="Возможности Android" />
    {!device ? <Notice message="Для этих функций установите новую нативную сборку APK." /> : <>
      {error ? <Notice tone="danger" message={error} /> : null}
      <Surface><SectionTitle>Определитель звонков</SectionTitle>
        <Notice message="Поиск по вашей CRM и, с разрешения, телефонной книге. Приложение не блокирует звонки и не записывает разговоры." />
        <Notice message="При выборе системной роли Android назначит Ведело определителем вместо текущего приложения." />
        {status?.roleAvailable === false ? <Notice tone="warning" message="На этом устройстве Android не предлагает роль определителя. Поиск номера вручную остаётся доступен." /> : null}
        {status?.callerEnabled && !status.roleHeld ? <Notice tone="warning" message="Определитель включён в приложении, но системная роль ещё не назначена. Для определения звонков нажмите «Выбрать определителем в Android» и подтвердите выбор в системном окне." /> : null}
        <Button title={status?.callerEnabled ? 'Выключить определитель' : 'Включить определитель'} disabled={busy} onPress={() => void action(() => device.setPreference('callerEnabled', !status?.callerEnabled))} />
        <Button title={status?.roleHeld ? 'Системная роль выбрана' : 'Выбрать определителем в Android'} disabled={busy || status?.roleAvailable === false || status?.roleHeld} variant="secondary" onPress={() => void action(() => device.requestCallerRole())} />
        <Button title={status?.contactsAllowed ? 'Доступ к контактам разрешён' : 'Разрешить определение номеров из контактов'} disabled={busy || status?.contactsAllowed} variant="secondary" onPress={() => void action(() => PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CONTACTS))} />
        <Button title={status?.overlayAllowed ? (status.overlayEnabled ? 'Выключить всплывающую карточку' : 'Включить всплывающую карточку') : 'Разрешить карточку поверх приложений'} disabled={busy} variant="secondary" onPress={() => void action(async () => {
          if (!status?.overlayAllowed) { await device.setPreference('overlayEnabled', true); await device.openOverlaySettings() }
          else await device.setPreference('overlayEnabled', !status.overlayEnabled)
        })} />
        <Button title="Разрешить уведомления вместо карточки" disabled={busy} variant="secondary" onPress={() => void action(() => Number(Platform.Version) >= 33 ? PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS) : Linking.openSettings())} />
        <Notice message={status?.snapshotAvailable ? 'Локальная копия CRM доступна.' : 'Локальная копия пока недоступна. Выполните синхронизацию.'} />
        <Button title="Проверить поиск номера" variant="secondary" onPress={() => router.push('/native/caller')} />
      </Surface>
      <Surface><SectionTitle>Конфиденциальность и виджет</SectionTitle>
        <Button title={appLock.enabled ? 'Выключить биометрическую блокировку' : 'Включить биометрическую блокировку'} disabled={busy} variant="secondary" onPress={() => void action(() => appLock.setEnabled(!appLock.enabled))} />
        <Button title="Импорт контактов телефона" variant="secondary" onPress={() => router.push('/native/contacts')} />
        <Notice message="По умолчанию персональные сведения скрыты при блокировке. Виджет показывает сроки без имён и описаний. Добавьте его через меню виджетов Android." />
        <Button title={status?.showWhileLocked ? 'Скрывать подробности при блокировке' : 'Разрешить подробности при блокировке и в виджете'} disabled={busy} variant="secondary" onPress={() => void action(() => device.setPreference('showWhileLocked', !status?.showWhileLocked))} />
        <Button title="Добавить ярлыки заявки, клиента и голоса" disabled={busy} onPress={() => void action(() => device.installShortcuts())} />
      </Surface>
    </>}
  </Screen>
}
