import { typography } from '../../shared/ui/theme'
import { useEffect, useRef, useState } from 'react'
import { Alert, StyleSheet, Switch, Text, View } from 'react-native'
import { api } from '../../shared/api/client'
import { Button, CompactField, Notice, SectionTitle, StatusChip, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { readStatus, statusPresentation, type ProviderStatus } from './integrationContract'
import { useIntegrationSession, type OperationGate } from './useIntegrationSession'

export function TelegramSection({ gate, onStatus }: { gate?: OperationGate; onStatus?: (state: ProviderStatus) => void }) {
  const styles = useThemeStyles(createStyles)
  const [token, setToken] = useState(''), [autoCreate, setAutoCreate] = useState(false)
  const [audience, setAudience] = useState<NonNullable<ProviderStatus['pushAudience']>>('all')
  const revision = useRef(0), [dirty, setDirty] = useState(false)
  const session = useIntegrationSession('telegram', gate, state => onStatus?.(state as ProviderStatus), () => setToken(''))
  const state = session.state as ProviderStatus | null
  useEffect(() => {
    if (state && !dirty) { setAutoCreate(state.autoCreateClients === true); setAudience(state.pushAudience || 'all') }
  }, [state, dirty])
  const disabled = session.initialLoading || session.working || session.needsRead
  const mutate = (body: Record<string, unknown>, matches: (state: ProviderStatus) => boolean, message: string) => {
    const edit = revision.current
    return session.run(() => api.post('/mobile/v1/integrations/telegram', body, { skipRefresh: true }),
      response => readStatus('telegram', response),
      () => ({ matches: next => matches(next as ProviderStatus), message }),
      () => { setToken(''); if (revision.current === edit) setDirty(false) })
  }
  const disconnect = () => {
    const epoch = session.token()
    Alert.alert('Отключить Telegram Business?', 'Бот перестанет получать сообщения. Сохранённые переписки останутся в CRM.', [
      { text: 'Отмена', style: 'cancel' }, { text: 'Отключить', style: 'destructive', onPress: () => {
        if (session.current(epoch)) void mutate({ action: 'disconnect' }, next => !next.enabled && !next.configured, 'Telegram отключён.')
      } },
    ])
  }
  return <Surface>
    <SectionTitle>Telegram Business</SectionTitle>
    <StatusChip {...statusPresentation(state || undefined)} />
    {state?.botUsername ? <Text style={styles.text}>Бот: @{state.botUsername}</Text> : null}
    {session.loadError ? <Notice tone="danger" message={session.loadError} /> : null}
    {session.notice ? <Notice {...session.notice} /> : null}
    <Button title="Обновить Telegram" variant="secondary" loading={session.initialLoading} disabled={session.working} onPress={() => void session.load()} />
    {state && !state.available ? <Notice tone="warning" message="Подключение Telegram Business недоступно на текущем тарифе." /> : null}
    {state?.available ? <>
      <Text style={styles.text}>Создайте бота в @BotFather, включите Business Mode и вставьте токен. Затем в настройках Telegram → Telegram Business → Чат-боты подключите этого бота и разрешите ответы. Ответить можно в течение 24 часов после сообщения клиента.</Text>
      <CompactField label="Токен бота Telegram" value={token} onChangeText={setToken} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!disabled} />
      <Button title={state.configured ? 'Заменить бота' : 'Подключить бота'} disabled={disabled || !token.trim()} loading={session.working} onPress={() => void mutate({ action: 'connect', botToken: token.trim() }, next => next.configured && next.enabled, 'Бот подключён. Проверьте его подключение в Telegram Business.')} />
      {state.configured ? <Button title="Проверить подключение" variant="secondary" disabled={disabled} onPress={() => void mutate({ action: 'check' }, next => next.enabled && ['connected', 'bot_ready'].includes(next.status), 'Подключение проверено.')} /> : null}
      {state.canReply === false ? <Notice tone="warning" message="Боту не разрешены ответы. Выдайте это право в Telegram Business." /> : null}
      <View style={styles.row}><Text style={styles.text}>Создавать клиентов из новых переписок</Text><Switch accessibilityLabel="Создавать клиентов Telegram" value={autoCreate} disabled={disabled} onValueChange={value => { revision.current += 1; setDirty(true); setAutoCreate(value) }} /></View>
      <SectionTitle>Уведомления о сообщениях</SectionTitle>
      {([['all', 'От всех'], ['clients', 'Только от клиентов'], ['non_clients', 'Только от новых контактов']] as const).map(([value, title]) => <Button key={value} title={`${audience === value ? '✓ ' : ''}${title}`} variant="secondary" disabled={disabled} onPress={() => { revision.current += 1; setDirty(true); setAudience(value) }} />)}
      <Button title="Сохранить настройки Telegram" disabled={disabled || !dirty} onPress={() => void mutate({ action: 'settings', autoCreateClients: autoCreate, pushAudience: audience }, next => next.autoCreateClients === autoCreate && next.pushAudience === audience, 'Настройки Telegram сохранены.')} />
    </> : null}
    {state?.configured ? <Button title="Отключить Telegram" variant="secondary" disabled={disabled} onPress={disconnect} /> : null}
  </Surface>
}
const createStyles = (palette: Palette) => StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, text: { flexShrink: 1, fontFamily: typography.fontFamily, color: palette.text, fontSize: 13, lineHeight: 18 } })
