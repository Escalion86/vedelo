import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { api } from '../../shared/api/client'
import { env } from '../../shared/config/env'
import { Button, ErrorNotice, Field, Notice, SectionTitle, StatusChip, Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import { spacing, type Palette } from '../../shared/ui/theme'
import { IntegrationFormState } from './IntegrationFormState'
import { readCalendars, readGoogle, readOAuthUrl, responseData, safeError, validOAuthCallback, type CalendarItem, type GoogleStatus, type Reminder } from './integrationContract'
import { IntegrationCancelled, useIntegrationSession, type OperationGate } from './useIntegrationSession'
type ReminderDraft = { method: 'popup' | 'email'; minutes: string }
export function GoogleCalendarForm({ gate, onStatus, onClose }: { gate: OperationGate; onStatus: (state: GoogleStatus) => void; onClose: () => void }) {
  const styles = useThemeStyles(createStyles); const { palette } = useTheme()
  const [confirm, setConfirm] = useState(false)
  const session = useIntegrationSession('google-calendar', gate, (state) => onStatus(state as GoogleStatus), useCallback(() => setConfirm(false), []))
  const google = session.state as GoogleStatus | null
  const [calendars, setCalendars] = useState<CalendarItem[] | null>(null)
  const [calendarError, setCalendarError] = useState(''); const [calendarLoading, setCalendarLoading] = useState(false)
  const [useDefault, setUseDefault] = useState(true); const [reminders, setReminders] = useState<ReminderDraft[]>([])
  const blocked = session.working || session.initialLoading || session.needsRead
  const editable = !!google?.available && !!google.connected && !blocked
  const loadCalendars = useCallback(async () => {
    const epoch = session.token()
    setCalendarLoading(true); setCalendarError('')
    try {
      const next = readCalendars(await api.get('/mobile/v1/integrations/google-calendar/calendars'))
      if (session.current(epoch)) setCalendars(next)
    } catch (reason) {
      if (session.current(epoch)) { setCalendars(null); setCalendarError(safeError(reason, 'Не удалось загрузить календари Google. Остальные интеграции доступны.')) }
    } finally { if (session.current(epoch)) setCalendarLoading(false) }
    // Lifecycle methods use the form's stable lifetime ref.
  }, [session.token, session.current])
  useEffect(() => {
    if (!google) return
    setUseDefault(google.reminders.useDefault)
    setReminders(google.reminders.overrides.map((item) => ({ method: item.method, minutes: String(item.minutes) })))
  }, [google])
  useEffect(() => {
    if (google?.connected && google.available) void loadCalendars()
    else { setCalendars(null); setCalendarError(''); setCalendarLoading(false) }
    // Only connection changes should reload the list, not every form edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [google?.connected, google?.available])
  const receipt = (response: unknown) => readGoogle(responseData(response))
  const patch = (body: Partial<GoogleStatus>, message: string) => {
    if (!editable) return
    return session.run(() => api.patch('/mobile/v1/integrations/google-calendar', body, { skipRefresh: true }), receipt, (result) => ({ matches: (next) => Object.entries(body).every(([key, value]) => JSON.stringify(result[key as keyof GoogleStatus]) === JSON.stringify(value) && JSON.stringify((next as GoogleStatus)[key as keyof GoogleStatus]) === JSON.stringify(value)), message }))
  }
  const connect = () => {
    if (!google?.available || blocked) return
    return session.run(async () => {
      const response = await api.get(`/mobile/v1/integrations/google-calendar/auth-url?appScheme=${encodeURIComponent(env.appScheme)}`)
      if (!session.current(epoch)) throw new IntegrationCancelled()
      const url = readOAuthUrl(response)
      const result = await WebBrowser.openAuthSessionAsync(url, `${env.appScheme}://more/integrations`)
      if (result.type === 'cancel' || result.type === 'dismiss') throw new IntegrationCancelled()
      if (result.type !== 'success' || !validOAuthCallback(result.url, env.appScheme)) throw new Error('INVALID_OAUTH_CALLBACK')
      // A local receipt only proves the callback shape. The subsequent bearer GET
      // must independently confirm connected=true before any success notice.
      return { success: true, data: {} }
    }, () => undefined, () => ({ matches: (next) => (next as GoogleStatus).connected && (next as GoogleStatus).enabled, message: 'Google Calendar подключён' }))
  }
  const epoch = session.token()
  const selectCalendar = (calendar: CalendarItem) => {
    if (!editable || calendarLoading) return
    return session.run(() => api.post('/mobile/v1/integrations/google-calendar/select', { calendarId: calendar.id }, { skipRefresh: true }), (response) => {
      const data = responseData(response)
      if (data.calendarId !== calendar.id || typeof data.calendarName !== 'string') throw new Error('WRONG_CALENDAR')
      return data
    }, () => ({ matches: (next) => (next as GoogleStatus).calendarId === calendar.id && (next as GoogleStatus).enabled && (next as GoogleStatus).connected, message: `Выбран календарь «${calendar.summary || calendar.id}»` }))
  }
  const saveReminders = () => {
    if (!editable) return
    if (!useDefault && (!reminders.length || reminders.some((item) => !/^\d+$/.test(item.minutes) || Number(item.minutes) <= 0 || !Number.isFinite(Number(item.minutes))))) { session.setNotice({ tone: 'danger', message: 'Укажите хотя бы одно напоминание и положительное число минут.' }); return }
    const overrides: Reminder[] = reminders.map((item) => ({ method: item.method, minutes: Number(item.minutes) }))
    return patch({ reminders: { useDefault, overrides: useDefault ? [] : overrides } }, 'Напоминания Google Calendar сохранены')
  }
  const disconnect = () => {
    if (!google || blocked || gate.owner) return
    if (!confirm) { setConfirm(true); return }
    setConfirm(false)
    return session.run(() => api.delete('/mobile/v1/integrations/google-calendar', undefined, { skipRefresh: true }), receipt, () => ({ matches: (next) => !(next as GoogleStatus).connected && !(next as GoogleStatus).enabled && (next as GoogleStatus).calendarId === '', message: 'Google Calendar отключён, OAuth-токены удалены' }))
  }
  return <Surface testID="integration-form-google-calendar">
    <SectionTitle>Google Calendar</SectionTitle>
    <IntegrationFormState loading={session.initialLoading} error={session.loadError} notice={session.notice} needsRead={session.needsRead || (!google && !session.initialLoading)} working={session.working} onRead={() => void session.load()} />
    {google ? <>
      {!google.available ? <Notice tone="warning" message="Синхронизация недоступна на текущем тарифе. Сохранённое подключение можно отключить." /> : null}
      {!google.connected ? <Button testID="connect-google-calendar" title="Подключить Google Calendar" disabled={!google.available || blocked} loading={session.working} onPress={() => void connect()} /> : <>
        <Text style={styles.title}>{google.calendarName || google.calendarId || 'Календарь не выбран'}</Text>
        <Button title={google.enabled ? 'Приостановить синхронизацию' : 'Возобновить синхронизацию'} variant="secondary" disabled={!editable} loading={session.working} onPress={() => void patch({ enabled: !google.enabled }, google.enabled ? 'Синхронизация приостановлена' : 'Синхронизация включена')} />
        <SectionTitle>Календарь для Ведело</SectionTitle>
        {calendarLoading ? <ActivityIndicator accessibilityLabel="Загрузка календарей Google" color={palette.primary} /> : null}
        {calendarError ? <ErrorNotice message={calendarError} /> : null}
        {calendarError ? <Button title="Повторить загрузку календарей" variant="secondary" disabled={calendarLoading || blocked} onPress={() => void loadCalendars()} /> : null}
        {calendars?.length === 0 ? <Notice tone="info" message="Google не вернул доступных календарей." /> : null}
        {calendars?.map((calendar) => <Pressable key={calendar.id} accessibilityRole="radio" accessibilityLabel={`Выбрать календарь ${calendar.summary || calendar.id}`} accessibilityState={{ checked: calendar.id === google.calendarId, disabled: !editable || calendarLoading }} disabled={!editable || calendarLoading} onPress={() => void selectCalendar(calendar)} style={[styles.choice, calendar.id === google.calendarId && styles.selected]}>
          <Text style={styles.title}>{calendar.summary || calendar.id}</Text><Text style={[styles.muted, calendar.id === google.calendarId && { color: palette.cardMeta }]}>{calendar.primary ? 'Основной календарь' : calendar.accessRole}</Text>
        </Pressable>)}
        <SectionTitle>Напоминания Google Calendar</SectionTitle>
        <Toggle title="Использовать стандартные уведомления Google" enabled={useDefault} disabled={!editable} onPress={() => setUseDefault((previous) => !previous)} />
        {!useDefault ? <>
          {reminders.map((reminder, index) => <View key={index} style={styles.reminder}>
            <Toggle title={`Напоминание ${index + 1}: ${reminder.method === 'popup' ? 'Уведомление' : 'Email'}`} enabled={reminder.method === 'email'} disabled={!editable} onPress={() => setReminders((previous) => previous.map((item, i) => i === index ? { ...item, method: item.method === 'email' ? 'popup' : 'email' } : item))} />
            <Field label={`Минут до события — напоминание ${index + 1}`} keyboardType="number-pad" value={reminder.minutes} editable={editable} onChangeText={(minutes) => setReminders((previous) => previous.map((item, i) => i === index ? { ...item, minutes } : item))} />
            <Button title={`Удалить напоминание ${index + 1}`} variant="danger" disabled={!editable} onPress={() => setReminders((previous) => previous.filter((_, i) => i !== index))} />
          </View>)}
          <Button title="Добавить напоминание" variant="secondary" disabled={!editable} onPress={() => setReminders((previous) => [...previous, { method: 'popup', minutes: '60' }])} />
        </> : null}
        <Button title="Сохранить напоминания" disabled={!editable} onPress={() => void saveReminders()} />
        <Toggle title="Удалять отменённые события из календаря" enabled={google.deleteCanceledFromCalendar} disabled={!editable} onPress={() => void patch({ deleteCanceledFromCalendar: !google.deleteCanceledFromCalendar }, 'Настройка отменённых событий сохранена')} />
        <Toggle title="Не переносить переданные события" enabled={google.skipTransferredFromCalendar} disabled={!editable} onPress={() => void patch({ skipTransferredFromCalendar: !google.skipTransferredFromCalendar }, 'Настройка переданных событий сохранена')} />
        <Notice tone="info" message="Новые настройки применяются при последующей синхронизации. Массовая отправка, состав данных и цвета событий пока доступны в Web/PWA." />
        <Button title={confirm ? 'Подтвердить отключение Google Calendar' : 'Отключить Google Calendar'} variant="danger" disabled={blocked} onPress={() => void disconnect()} />
        {confirm ? <Button title="Отмена подтверждения" variant="secondary" disabled={session.working} onPress={() => setConfirm(false)} /> : null}
      </>}
    </> : null}
    <Button title="Закрыть без сохранения" variant="secondary" onPress={() => { session.invalidate(); onClose() }} />
  </Surface>
}
function Toggle({ title, enabled, disabled, onPress }: { title: string; enabled: boolean; disabled: boolean; onPress: () => void }) {
  const styles = useThemeStyles(createStyles)
  return <Pressable accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{ checked: enabled, disabled }} disabled={disabled} onPress={onPress} style={[styles.toggle, disabled && { opacity: 0.65 }]}><Text style={styles.grow}>{title}</Text><StatusChip label={enabled ? 'Да' : 'Нет'} tone={enabled ? 'success' : 'neutral'} /></Pressable>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  title: { color: palette.text, fontSize: 14, fontWeight: '700', flexShrink: 1 }, muted: { color: palette.cardMuted, fontSize: 12, lineHeight: 18 },
  choice: { minHeight: 48, padding: spacing.sm, gap: 4, borderRadius: 8, borderWidth: 1, borderColor: palette.border }, selected: { backgroundColor: palette.rowSelected, borderColor: palette.primary },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }, grow: { color: palette.text, flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18 },
  reminder: { gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: 8 },
})
