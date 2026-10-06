import { useCallback, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { api } from '../../shared/api/client'
import { Button, Field, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { IntegrationFormState } from './IntegrationFormState'
import { readProvider, responseData, titles, validIdentifier, type GoogleStatus, type ProviderStatus } from './integrationContract'
import { useIntegrationSession, type OperationGate } from './useIntegrationSession'
export function CredentialIntegrationForm({ provider, gate, onStatus, onClose }: { provider: 'avito' | 'vk'; gate: OperationGate; onStatus: (state: ProviderStatus) => void; onClose: () => void }) {
  const styles = useThemeStyles(createStyles)
  const [clientId, setClientId] = useState(''); const [accountId, setAccountId] = useState('')
  const [secret, setSecret] = useState(''); const [confirmation, setConfirmation] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const clear = useCallback(() => { setSecret(''); setConfirmation(''); setConfirmDisconnect(false) }, [])
  const statusLoaded = useCallback((value: GoogleStatus | ProviderStatus) => { const state = value as ProviderStatus; setClientId(state.clientId || ''); setAccountId(state.accountId || ''); onStatus(state) }, [onStatus])
  const session = useIntegrationSession(provider, gate, statusLoaded, clear)
  const details = session.state as ProviderStatus | null
  const blocked = session.working || session.initialLoading || session.needsRead
  const editable = !!details && details.available && !blocked
  const mutate = (request: () => Promise<unknown>, matches: (next: ProviderStatus) => boolean, message: string) => session.run(request, (response) => readProvider(provider, responseData(response)), (result) => {
    const manualWebhook = provider === 'avito' && result.status === 'webhook_manual'
    return {
      matches: (next) => matches(result) && matches(next as ProviderStatus) && (!manualWebhook || (next as ProviderStatus).status === 'webhook_manual'),
      message: manualWebhook ? 'Доступ Avito проверен. Webhook нужно настроить вручную в Web/PWA.' : message,
      tone: manualWebhook ? 'warning' : 'success',
    }
  })
  const connect = () => {
    if (!editable || gate.owner) return
    if (!validIdentifier(accountId) || !validIdentifier(secret) || (provider === 'avito' ? !validIdentifier(clientId) : !validIdentifier(confirmation))) { session.setNotice({ tone: 'danger', message: 'Заполните реквизиты без пробелов по краям и недопустимых символов.' }); return }
    // Snapshot the original strings; never silently strip URL prefixes or digits.
    const payload = provider === 'avito' ? { clientId, clientSecret: secret, userId: accountId } : { groupId: accountId, accessToken: secret, confirmationCode: confirmation }
    clear()
    return mutate(() => api.post(`/mobile/v1/integrations/${provider}`, payload, { skipRefresh: true }), (next) => next.enabled && next.configured && (next.status === 'connected' || (provider === 'avito' && next.status === 'webhook_manual')) && next.accountId === accountId && (provider !== 'avito' || next.clientId === clientId), `${titles[provider]} подключён`)
  }
  const check = () => editable && mutate(() => api.patch(`/mobile/v1/integrations/${provider}`, undefined, { skipRefresh: true }), (next) => next.configured && next.enabled && (next.status === 'connected' || (provider === 'avito' && next.status === 'webhook_manual')) && next.accountId === details.accountId && (provider !== 'avito' || next.clientId === details.clientId), `${titles[provider]}: подключение работает`)
  const disconnect = () => {
    if (!details || blocked || gate.owner) return
    if (!confirmDisconnect) { setConfirmDisconnect(true); return }
    clear()
    return mutate(() => api.delete(`/mobile/v1/integrations/${provider}`, undefined, { skipRefresh: true }), (next) => !next.enabled && !next.configured && next.accountId === '' && (provider !== 'avito' || next.clientId === ''), `${titles[provider]} отключён, реквизиты удалены`)
  }
  return <Surface testID={`integration-form-${provider}`}>
    <SectionTitle>{provider === 'avito' ? 'Подключение Avito' : 'Подключение сообщества VK'}</SectionTitle>
    <IntegrationFormState loading={session.initialLoading} error={session.loadError} notice={session.notice} needsRead={session.needsRead || (!details && !session.initialLoading)} working={session.working} onRead={() => void session.load()} />
    {details ? <>
      {!details.available ? <Notice tone="warning" message="Интеграция недоступна по тарифу. Сохранённое подключение можно отключить." /> : null}
      {provider === 'avito' ? <>
        <Field label="Client ID" value={clientId} onChangeText={setClientId} autoCapitalize="none" autoCorrect={false} editable={editable} />
        <Field label="Client Secret" value={secret} onChangeText={setSecret} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={editable} />
        <Field label="ID пользователя Avito" value={accountId} onChangeText={setAccountId} autoCapitalize="none" autoCorrect={false} editable={editable} />
      </> : <>
        <Field label="ID сообщества" value={accountId} onChangeText={setAccountId} autoCapitalize="none" autoCorrect={false} editable={editable} />
        <Field label="Токен сообщества" value={secret} onChangeText={setSecret} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={editable} />
        <Field label="Строка подтверждения Callback API" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={editable} />
      </>}
      <Text style={styles.muted}>Секрет отправляется на сервер и очищается после попытки подключения. Локальная копия не сохраняется.</Text>
      <Button title="Проверить и подключить" loading={session.working} disabled={!editable} onPress={() => void connect()} />
      {details.configured ? <>
        <Button title="Проверить текущее подключение" variant="secondary" disabled={!editable} onPress={() => void check()} />
        <Button title={confirmDisconnect ? `Подтвердить отключение ${titles[provider]}` : 'Отключить интеграцию'} variant="danger" disabled={blocked} onPress={() => void disconnect()} />
      </> : null}
      {confirmDisconnect ? <Button title="Отмена подтверждения" variant="secondary" disabled={session.working} onPress={() => setConfirmDisconnect(false)} /> : null}
    </> : null}
    <Button title="Закрыть без сохранения" variant="secondary" onPress={() => { session.invalidate(); clear(); onClose() }} />
  </Surface>
}
const createStyles = (palette: Palette) => StyleSheet.create({ muted: { color: palette.cardMuted, fontSize: 12, lineHeight: 18 } })
