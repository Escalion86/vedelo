import { useCallback, useRef, useState } from 'react'
import { Linking, Text, View, StyleSheet } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useAuth } from '../../shared/auth/AuthProvider'
import { api } from '../../shared/api/client'
import { enableExpoPushNotifications, disableExpoPushNotifications, getExpoPushDeviceState } from '../../shared/notifications/useExpoPushNotifications'
import { Button, SectionTitle, Surface } from '../../shared/ui/components'
import { CompactField } from '../../shared/ui/CompactField'
import { Notice } from '../../shared/ui/Notice'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { useScreenLifetime } from '../profile/useScreenLifetime'

type Settings = { remindersEnabled: boolean; reminderTime: string; pushConfigured: boolean; deviceSubscribed: boolean; activeDeviceCount: number; timeZone: string }
type Device = Awaited<ReturnType<typeof getExpoPushDeviceState>>
export const validReminderTime = (value: string) => /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(value)
export function NotificationsSection() {
  const { user } = useAuth()
  return user ? <UserNotifications key={`${user.tenantId}:${user._id}`} /> : <Notice message="Войдите в пользовательский аккаунт" />
}
function UserNotifications() {
  const styles = useThemeStyles(createStyles), terms = useWorkItemTerminology(), capture = useScreenLifetime()
  const [settings, setSettings] = useState<Settings | null>(null), [device, setDevice] = useState<Device | null>(null)
  const [serverConfirmed, setServerConfirmed] = useState(false)
  const [time, setTime] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('')
  const lock = useRef(false), revision = useRef(0)
  const read = useCallback(async (current: () => boolean, changeTime = true) => {
    const [server, local] = await Promise.allSettled([api.get<{ success: true; data: Settings }>('/mobile/v1/notifications'), getExpoPushDeviceState()])
    if (current() && local.status === 'fulfilled') setDevice(local.value)
    if (server.status !== 'fulfilled' || local.status !== 'fulfilled') throw new Error('Не удалось загрузить настройки уведомлений')
    const response = server.value
    if (!response.success || typeof response.data?.activeDeviceCount !== 'number' || !response.data.timeZone || !validReminderTime(response.data.reminderTime)) throw new Error('Unconfirmed')
    if (current()) { setSettings(response.data); setServerConfirmed(true); setDevice(local.value); if (changeTime) setTime(response.data.reminderTime) }
    return response.data
  }, [])
  const load = useCallback(async () => {
    const current = capture(), request = ++revision.current
    setLoading(true); setServerConfirmed(false); setError('')
    try { await read(() => current() && request === revision.current) }
    catch { if (current() && request === revision.current) setError('Не удалось загрузить настройки уведомлений') }
    finally { if (current() && request === revision.current) setLoading(false) }
  }, [capture, read])
  useFocusEffect(useCallback(() => { void load(); return () => { revision.current++ } }, [load]))
  const run = async (action: (current: () => boolean) => Promise<void>) => {
    if (lock.current) return
    lock.current = true; revision.current++
    const current = capture(); if (!current()) { lock.current = false; return }; setLoading(true); setError(''); setMessage('')
    try { await action(current) }
    catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : 'Результат не подтверждён') }
    finally { lock.current = false; if (current()) setLoading(false); else if (capture()()) void load() }
  }
  const enabled = device?.permission === 'granted' && device.enabled && device.subscribed && settings?.deviceSubscribed
  const enable = () => run(async (current) => {
    const result = await enableExpoPushNotifications()
    if (!current()) return
    if (!result.ok) { const local = await getExpoPushDeviceState(); if (current()) setDevice(local); throw new Error(result.error) }
    await api.patch('/mobile/v1/notifications', { pushConfigured: true }, { skipRefresh: true })
    if (!current()) return
    const readSettings = await read(current, false)
    if (!readSettings.deviceSubscribed) throw new Error('Регистрация устройства не подтверждена')
    if (current()) setMessage('Push-уведомления включены на этом устройстве')
  })
  const disable = () => run(async (current) => {
    const result = await disableExpoPushNotifications()
    if (!current()) return
    const local = await getExpoPushDeviceState()
    if (!current()) return
    setDevice(local)
    if (result.pending) setServerConfirmed(false)
    setMessage(result.pending ? 'Push отключён локально. Серверная отписка завершится после восстановления сети.' : 'Push-уведомления отключены на этом устройстве')
    if (!result.pending) await read(current, false)
  })
  const save = (patch: Partial<Settings>) => run(async (current) => {
    if (!settings) return
    if (patch.reminderTime !== undefined && !validReminderTime(patch.reminderTime)) throw new Error('Укажите время от 00:00 до 23:45 с шагом 15 минут')
    await api.patch('/mobile/v1/notifications', patch, { skipRefresh: true })
    if (!current()) return
    const confirmed = await read(current, false)
    if (Object.entries(patch).some(([key, value]) => confirmed[key as keyof Settings] !== value)) throw new Error('Сохранение настройки не подтверждено')
    if (current()) setMessage('Настройки напоминаний сохранены')
  })
  const test = () => run(async (current) => {
    const response = await api.post<{ success: true; data: { sent: number } }>('/mobile/v1/notifications/test', undefined, { skipRefresh: true })
    if (!response.success || !Number.isFinite(response.data?.sent)) throw new Error('Результат теста не подтверждён')
    if (current()) setMessage(`Сервис принял тест для отправки: ${response.data.sent} устройств. Доставка не подтверждена.`)
  })
  return <>
    {loading ? <Notice message="Загружаем настройки уведомлений…" /> : null}
    {error ? <><Notice tone="danger" message={error} /><Button title="Обновить настройки уведомлений" variant="secondary" onPress={load} disabled={loading} /></> : null}
    {message ? <Notice message={message} /> : null}
    {device ? <Surface><SectionTitle>Push на этом устройстве</SectionTitle>
      <Text style={styles.text}>Разрешение: {device.permission === 'granted' ? 'выдано' : device.permission === 'denied' ? 'запрещено' : 'не запрошено'}</Text>
      <Text style={styles.text}>{enabled ? 'Включено' : device.enabled ? 'Регистрация не подтверждена' : 'Отключено локально'}</Text>
      <Button title={enabled ? 'Отключить на этом устройстве' : 'Включить push'} variant={enabled ? 'secondary' : 'primary'} onPress={enabled ? disable : enable} disabled={loading} />
      {device.enabled && !enabled ? <Button title="Отключить на этом устройстве" variant="secondary" onPress={disable} disabled={loading} /> : null}
      {device.permission === 'denied' ? <Button title="Открыть настройки Android" variant="secondary" onPress={() => { void Linking.openSettings().catch(() => setError('Не удалось открыть настройки Android')) }} disabled={loading} /> : null}
      <Button title="Отправить тест" variant="secondary" onPress={test} disabled={!enabled || loading} />
      {settings && serverConfirmed && !loading && !error ? <Text style={styles.meta}>Активных Android-устройств: {settings.activeDeviceCount}. Отключение действует только для текущего устройства.</Text> : null}
    </Surface> : null}
    {settings ? <Surface><SectionTitle>Ежедневная сводка</SectionTitle><Text style={styles.text}>{terms.plural} и контакты · {settings.remindersEnabled ? 'Включена' : 'Отключена'}</Text>{serverConfirmed && !loading && !error ? <Text style={styles.meta}>Часовой пояс: {settings.timeZone}</Text> : <Text style={styles.meta}>Часовой пояс: данные не подтверждены</Text>}
      <Button title={settings.remindersEnabled ? 'Отключить ежедневную сводку' : 'Включить ежедневную сводку'} variant="secondary" onPress={() => save({ remindersEnabled: !settings.remindersEnabled })} disabled={loading} />
      <CompactField label="Время, шаг 15 минут" value={time} onChangeText={setTime} maxLength={5} editable={!loading} />
      <View style={styles.row}>{['08:00','10:00','12:00','18:00'].map((value) => <Button key={value} title={value} variant={time === value ? 'primary' : 'secondary'} onPress={() => setTime(value)} disabled={loading} />)}</View>
      <Button title="Сохранить время" onPress={() => save({ reminderTime: time })} disabled={loading} />
    </Surface> : null}
    <Notice message="Приложение запрашивает разрешение и регистрирует push только после нажатия «Включить push». Из уведомления можно выполнить задачу либо перенести её на завтра или на три дня." />
  </>
}
const createStyles = (palette: Palette) => StyleSheet.create({ text: { color: palette.text, fontSize: 14 }, meta: { color: palette.cardMuted, fontSize: 12, lineHeight: 18 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 } })
