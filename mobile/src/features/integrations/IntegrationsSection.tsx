import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import { api } from '../../shared/api/client'
import { env } from '../../shared/config/env'
import {
  Button,
  ErrorNotice,
  Field,
  SectionTitle,
  StatusChip,
  Surface,
} from '../../shared/ui/components'
import { colors, radius, spacing } from '../../shared/ui/theme'
import { ManagedIntegrationsSection } from './ManagedIntegrationsSection'

type CalendarReminder = { method: 'email' | 'popup'; minutes: number }
type GoogleCalendarStatus = {
  available: boolean
  connected: boolean
  enabled: boolean
  calendarId: string
  calendarName: string
  reminders: { useDefault: boolean; overrides: CalendarReminder[] }
  deleteCanceledFromCalendar: boolean
  skipTransferredFromCalendar: boolean
}
type ProviderStatus = {
  available: boolean
  enabled?: boolean
  connected?: boolean
  configured?: boolean
  status?: string
  clientId?: string
  accountId?: string
}
type IntegrationStatus = Record<string, ProviderStatus> & {
  googleCalendar: GoogleCalendarStatus
}
type CalendarItem = {
  id: string
  summary?: string
  primary?: boolean
  accessRole?: string
}

const authReturnUrl = `${env.appScheme}://more/integrations`

export function IntegrationsSection() {
  const [data, setData] = useState<IntegrationStatus | null>(null)
  const [calendars, setCalendars] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [providerForm, setProviderForm] = useState<'avito' | 'vk' | null>(null)
  const [providerClientId, setProviderClientId] = useState('')
  const [providerAccountId, setProviderAccountId] = useState('')
  const [providerSecret, setProviderSecret] = useState('')
  const [providerConfirmation, setProviderConfirmation] = useState('')
  const [confirmProviderDisconnect, setConfirmProviderDisconnect] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get<{ success: true; data: IntegrationStatus }>(
        '/mobile/v1/integrations/status'
      )
      setData(response.data)
      if (response.data.googleCalendar?.connected) {
        const calendarResponse = await api.get<{
          success: true
          data: { calendars: CalendarItem[]; selectedId: string }
        }>('/mobile/v1/integrations/google-calendar/calendars')
        setCalendars(calendarResponse.data.calendars || [])
      } else {
        setCalendars([])
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить интеграции')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const connectGoogle = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await api.get<{ success: true; data: { url: string } }>(
        `/mobile/v1/integrations/google-calendar/auth-url?appScheme=${encodeURIComponent(env.appScheme)}`
      )
      const result = await WebBrowser.openAuthSessionAsync(response.data.url, authReturnUrl)
      if (result.type === 'success' && result.url.includes('gc_connected=1')) {
        setMessage('Google Calendar подключён')
      } else if (result.type === 'success' && result.url.includes('gc_error=')) {
        throw new Error('Google не подтвердил подключение календаря')
      }
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось подключить Google Calendar')
    } finally {
      setLoading(false)
    }
  }

  const updateGoogle = async (patch: Record<string, unknown>, successMessage: string) => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await api.patch<{ success: true; data: GoogleCalendarStatus }>(
        '/mobile/v1/integrations/google-calendar',
        patch
      )
      setData((current) => current
        ? { ...current, googleCalendar: response.data }
        : current)
      setMessage(successMessage)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить настройку')
    } finally {
      setLoading(false)
    }
  }

  const selectCalendar = async (calendar: CalendarItem) => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await api.post('/mobile/v1/integrations/google-calendar/select', {
        calendarId: calendar.id,
      })
      setMessage(`Выбран календарь «${calendar.summary || calendar.id}»`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось выбрать календарь')
    } finally {
      setLoading(false)
    }
  }

  const disconnectGoogle = async () => {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true)
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await api.delete<{ success: true; data: GoogleCalendarStatus }>(
        '/mobile/v1/integrations/google-calendar'
      )
      setData((current) => current
        ? { ...current, googleCalendar: response.data }
        : current)
      setCalendars([])
      setConfirmDisconnect(false)
      setMessage('Google Calendar отключён, OAuth-токены удалены')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отключить Google Calendar')
    } finally {
      setLoading(false)
    }
  }

  const clearProviderForm = () => {
    setProviderForm(null)
    setProviderClientId('')
    setProviderAccountId('')
    setProviderSecret('')
    setProviderConfirmation('')
    setConfirmProviderDisconnect(false)
  }

  const openProviderForm = async (provider: 'avito' | 'vk') => {
    setLoading(true)
    setError('')
    setMessage('')
    clearProviderForm()
    try {
      const response = await api.get<{ success: true; data: ProviderStatus }>(
        `/mobile/v1/integrations/${provider}`
      )
      setData((current) => current ? { ...current, [provider]: response.data } : current)
      setProviderForm(provider)
      setProviderClientId(response.data.clientId || '')
      setProviderAccountId(response.data.accountId || '')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось открыть настройки')
    } finally {
      setLoading(false)
    }
  }

  const connectProvider = async () => {
    if (!providerForm) return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const payload = providerForm === 'avito'
        ? {
            clientId: providerClientId.trim(),
            clientSecret: providerSecret,
            userId: providerAccountId.trim(),
          }
        : {
            groupId: providerAccountId.trim(),
            accessToken: providerSecret,
            confirmationCode: providerConfirmation.trim(),
          }
      const response = await api.post<{ success: true; data: ProviderStatus }>(
        `/mobile/v1/integrations/${providerForm}`,
        payload
      )
      const providerName = providerForm === 'avito' ? 'Avito' : 'VK'
      setData((current) => current
        ? { ...current, [providerForm]: response.data }
        : current)
      clearProviderForm()
      setMessage(`${providerName} подключён`)
      await load()
    } catch (reason) {
      clearProviderForm()
      setError(reason instanceof Error ? reason.message : 'Не удалось подключить интеграцию')
    } finally {
      setLoading(false)
    }
  }

  const checkProvider = async (provider: 'avito' | 'vk') => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await api.patch<{ success: true; data: ProviderStatus }>(
        `/mobile/v1/integrations/${provider}`
      )
      setData((current) => current ? { ...current, [provider]: response.data } : current)
      setMessage(`${provider === 'avito' ? 'Avito' : 'VK'}: подключение работает`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Проверка завершилась ошибкой')
    } finally {
      setLoading(false)
    }
  }

  const disconnectProvider = async () => {
    if (!providerForm) return
    if (!confirmProviderDisconnect) {
      setConfirmProviderDisconnect(true)
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const provider = providerForm
      const response = await api.delete<{ success: true; data: ProviderStatus }>(
        `/mobile/v1/integrations/${provider}`
      )
      setData((current) => current ? { ...current, [provider]: response.data } : current)
      clearProviderForm()
      setMessage(`${provider === 'avito' ? 'Avito' : 'VK'} отключён, реквизиты удалены`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отключить интеграцию')
    } finally {
      setLoading(false)
    }
  }

  const google = data?.googleCalendar
  const reminderMinutes = google?.reminders?.useDefault
    ? 0
    : google?.reminders?.overrides?.find((item) => item.method === 'popup')?.minutes || 0
  const label = (item?: ProviderStatus) => !item?.available
    ? 'Недоступно'
    : item.connected || item.enabled
      ? 'Подключено'
      : item.configured
        ? 'Настроено'
        : 'Не подключено'
  const tone = (item?: ProviderStatus) => item?.connected || item?.enabled
    ? 'success' as const
    : item?.available
      ? 'warning' as const
      : 'neutral' as const

  return <>
    {error ? <ErrorNotice message={error} /> : null}
    {message ? <Surface><Text style={styles.success}>{message}</Text></Surface> : null}
    <Surface>
      <SectionTitle>Google Calendar</SectionTitle>
      <IntegrationState
        icon="calendar-outline"
        title={google?.calendarName || 'Google Calendar'}
        description="Мероприятия и следующие контакты"
        label={label(google)}
        tone={tone(google)}
      />
      {!google?.connected ? (
        <Button
          testID="connect-google-calendar"
          title="Подключить Google Calendar"
          onPress={connectGoogle}
          loading={loading}
          disabled={!google?.available}
        />
      ) : <>
        <Button
          title={google.enabled ? 'Приостановить синхронизацию' : 'Возобновить синхронизацию'}
          variant="secondary"
          onPress={() => updateGoogle(
            { enabled: !google.enabled },
            google.enabled ? 'Синхронизация приостановлена' : 'Синхронизация включена'
          )}
          disabled={loading}
        />
        <SectionTitle>Календарь для Ведело</SectionTitle>
        {calendars.map((calendar) => {
          const selected = calendar.id === google.calendarId
          return <Pressable
            key={calendar.id}
            style={[styles.choice, selected && styles.choiceSelected]}
            onPress={() => selectCalendar(calendar)}
            disabled={loading}
          >
            <MaterialCommunityIcons
              name={selected ? 'radiobox-marked' : 'radiobox-blank'}
              size={21}
              color={selected ? colors.primary : colors.textMuted}
            />
            <View style={styles.grow}>
              <Text style={styles.title}>{calendar.summary || calendar.id}</Text>
              <Text style={styles.muted}>{calendar.primary ? 'Основной календарь' : calendar.accessRole || ''}</Text>
            </View>
          </Pressable>
        })}
        <SectionTitle>Напоминание по умолчанию</SectionTitle>
        <View style={styles.chips}>
          {[
            [0, 'Настройки Google'],
            [60, 'За час'],
            [1440, 'За день'],
          ].map(([minutes, title]) => <Pressable
            key={minutes}
            style={[styles.chip, reminderMinutes === minutes && styles.chipActive]}
            onPress={() => updateGoogle({
              reminders: minutes === 0
                ? { useDefault: true, overrides: [] }
                : { useDefault: false, overrides: [{ method: 'popup', minutes }] },
            }, `Напоминание: ${title}`)}
            disabled={loading}
          ><Text style={[styles.chipText, reminderMinutes === minutes && styles.chipTextActive]}>{title}</Text></Pressable>)}
        </View>
        <SettingToggle
          title="Удалять отменённые события"
          enabled={google.deleteCanceledFromCalendar}
          onPress={() => updateGoogle(
            { deleteCanceledFromCalendar: !google.deleteCanceledFromCalendar },
            'Настройка отменённых событий сохранена'
          )}
          disabled={loading}
        />
        <SettingToggle
          title="Не переносить переданные события"
          enabled={google.skipTransferredFromCalendar}
          onPress={() => updateGoogle(
            { skipTransferredFromCalendar: !google.skipTransferredFromCalendar },
            'Настройка переданных событий сохранена'
          )}
          disabled={loading}
        />
        <Button
          title={confirmDisconnect ? 'Подтвердить отключение' : 'Отключить Google Calendar'}
          variant="secondary"
          onPress={disconnectGoogle}
          disabled={loading}
        />
        {confirmDisconnect ? <Button title="Отмена" variant="secondary" onPress={() => setConfirmDisconnect(false)} disabled={loading} /> : null}
      </>}
    </Surface>
    <Surface>
      <SectionTitle>Другие интеграции</SectionTitle>
      <IntegrationState icon="storefront-outline" title="Avito" description="Входящие лиды и ответы клиентам" label={label(data?.avito)} tone={tone(data?.avito)} />
      <Button title={data?.avito?.configured ? 'Настроить Avito' : 'Подключить Avito'} variant="secondary" onPress={() => openProviderForm('avito')} disabled={!data?.avito?.available || loading} />
      <IntegrationState icon="alpha-v-circle-outline" title="VK" description="Сообщения сообщества и связанные заявки" label={label(data?.vk)} tone={tone(data?.vk)} />
      <Button title={data?.vk?.configured ? 'Настроить VK' : 'Подключить VK'} variant="secondary" onPress={() => openProviderForm('vk')} disabled={!data?.vk?.available || loading} />
    </Surface>
    <ManagedIntegrationsSection
      overview={{
        telephony: data?.telephony,
        ai: data?.ai,
        publicLeadApi: data?.publicLeadApi,
      }}
      onChanged={load}
    />
    {providerForm ? <Surface>
      <SectionTitle>{providerForm === 'avito' ? 'Подключение Avito' : 'Подключение сообщества VK'}</SectionTitle>
      {providerForm === 'avito' ? <>
        <Field label="Client ID" value={providerClientId} onChangeText={setProviderClientId} autoCapitalize="none" />
        <Field label="Client Secret" value={providerSecret} onChangeText={setProviderSecret} secureTextEntry autoCapitalize="none" />
        <Field label="ID пользователя Avito" value={providerAccountId} onChangeText={setProviderAccountId} keyboardType="number-pad" />
      </> : <>
        <Field label="ID сообщества" value={providerAccountId} onChangeText={setProviderAccountId} keyboardType="number-pad" />
        <Field label="Токен сообщества" value={providerSecret} onChangeText={setProviderSecret} secureTextEntry autoCapitalize="none" />
        <Field label="Строка подтверждения Callback API" value={providerConfirmation} onChangeText={setProviderConfirmation} autoCapitalize="none" />
      </>}
      <Text style={styles.privacy}>Секретное значение отправляется только по HTTPS и очищается из формы после запроса. Приложение не сохраняет его в SecureStore или SQLite.</Text>
      <Button title="Проверить и подключить" onPress={connectProvider} loading={loading} />
      {(providerForm === 'avito' ? data?.avito?.configured : data?.vk?.configured) ? <>
        <Button title="Проверить текущее подключение" variant="secondary" onPress={() => checkProvider(providerForm)} disabled={loading} />
        <Button title={confirmProviderDisconnect ? 'Подтвердить отключение и удаление реквизитов' : 'Отключить интеграцию'} variant="secondary" onPress={disconnectProvider} disabled={loading} />
      </> : null}
      <Button title="Закрыть без сохранения" variant="secondary" onPress={clearProviderForm} disabled={loading} />
    </Surface> : null}
    <Button title="Открыть переписки Avito и VK" onPress={() => router.push('/conversations' as never)} />
    <Button title="Обновить статусы" variant="secondary" loading={loading} onPress={load} />
    <Text style={styles.privacy}>OAuth-токены Google и секреты других провайдеров хранятся только на сервере.</Text>
  </>
}

const IntegrationState = ({ icon, title, description, label, tone }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  title: string
  description: string
  label: string
  tone: 'neutral' | 'success' | 'warning'
}) => <View style={styles.integration}>
  <View style={styles.round}><MaterialCommunityIcons name={icon} size={21} color={colors.primary} /></View>
  <View style={styles.grow}><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{description}</Text></View>
  <StatusChip label={label} tone={tone} />
</View>

const SettingToggle = ({ title, enabled, onPress, disabled }: {
  title: string
  enabled: boolean
  onPress: () => void
  disabled: boolean
}) => <Pressable style={styles.setting} onPress={onPress} disabled={disabled}>
  <Text style={styles.grow}>{title}</Text>
  <StatusChip label={enabled ? 'Да' : 'Нет'} tone={enabled ? 'success' : 'neutral'} />
</Pressable>

const styles = StyleSheet.create({
  integration: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  success: { color: colors.success, fontSize: 13, fontWeight: '700' },
  privacy: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  setting: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 46, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
})
