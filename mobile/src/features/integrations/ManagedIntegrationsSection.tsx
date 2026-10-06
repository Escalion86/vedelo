import { useCallback, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { api } from '../../shared/api/client'
import { Button, Field, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { spacing, type Palette } from '../../shared/ui/theme'
import { AiUsagePanel, type AiProvider } from './AiUsagePanel'
import { IntegrationRow } from './IntegrationRow'
import { IntegrationFormState } from './IntegrationFormState'
import { useIntegrationSession, type OperationGate } from './useIntegrationSession'
import { isObject, readProvider, responseData, titles, validHttpsUrl, validIdentifier, validText, type ApiKeyMetadata, type GoogleStatus, type ManagedProvider, type ProviderStatus } from './integrationContract'

type Secret = { title: string; value: string; webhookUrl?: string }
const parseAiProvider = (value?: string): AiProvider | null => value === 'artistcrm' || value === 'aitunnel' ? value : null

export function ManagedIntegrationsSection({ initialProvider, gate, onStatus, onClose }: {
  overview: { telephony?: Partial<ProviderStatus>; ai?: Partial<ProviderStatus>; publicLeadApi?: Partial<ProviderStatus> }
  onChanged: () => Promise<void>; initialProvider?: ManagedProvider; gate?: OperationGate
  onStatus?: (provider: ManagedProvider, state: ProviderStatus) => void; onClose?: () => void
}) {
  const [selected, setSelected] = useState<ManagedProvider | null>(initialProvider || null)
  const localGate = useRef<OperationGate>({ owner: null })
  const [readStatuses, setReadStatuses] = useState<Partial<Record<ManagedProvider, ProviderStatus>>>({})
  return <>
    {!initialProvider ? <Surface>{(['telephony', 'ai', 'public-leads'] as const).map((provider) => <IntegrationRow key={provider} title={titles[provider]} description={provider === 'ai' ? 'ИИ Ведело или свой AITunnel' : provider === 'telephony' ? 'Звонки и записи разговоров' : 'Сайт, Tilda и другие источники'} icon={provider === 'ai' ? 'creation-outline' : provider === 'telephony' ? 'phone-voip' : 'api'} state={readStatuses[provider]} selected={selected === provider} onPress={() => setSelected(provider)} />)}</Surface> : null}
    {selected ? <ManagedForm key={selected} provider={selected} gate={gate || localGate.current} onStatus={(state) => { setReadStatuses((previous) => ({ ...previous, [selected]: state })); onStatus?.(selected, state) }} onClose={() => { setSelected(null); onClose?.() }} /> : null}
  </>
}

function ManagedForm({ provider, gate, onStatus, onClose }: { provider: ManagedProvider; gate?: OperationGate; onStatus: (state: ProviderStatus) => void; onClose: () => void }) {
  const styles = useThemeStyles(createStyles)
  const [secret, setSecret] = useState<Secret | null>(null)
  const [credential, setCredential] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [transcriptionModel, setTranscriptionModel] = useState('whisper-1')
  const [analysisModel, setAnalysisModel] = useState('gpt-4o-mini')
  const [aiProvider, setAiProvider] = useState<AiProvider | null>(null)
  const [confirmAction, setConfirmAction] = useState('')
  const clearSensitive = useCallback(() => { setCredential(''); setSecret(null); setConfirmAction('') }, [])
  const updateState = useCallback((value: GoogleStatus | ProviderStatus) => {
    const state = value as ProviderStatus
    onStatus(state)
    if (provider === 'ai') {
      setAiProvider(parseAiProvider(state.analysisProvider))
      setTranscriptionModel(state.transcriptionModel || 'whisper-1')
      setAnalysisModel(state.analysisModel || 'gpt-4o-mini')
    }
  }, [provider, onStatus])
  const session = useIntegrationSession(provider, gate, updateState, clearSensitive)
  const details = session.state as ProviderStatus | null
  const blocked = session.working || session.initialLoading || session.needsRead || !!secret
  const editable = !!details && !blocked && details.available
  const invalid = (message: string) => session.setNotice({ tone: 'danger', message })
  const receipt = (response: unknown) => readProvider(provider, responseData(response))
  const perform = (request: () => Promise<unknown>, matches: (state: ProviderStatus) => boolean, message: string) => session.run(request, receipt, (result) => ({ matches: (state) => matches(result) && matches(state as ProviderStatus), message }))
  const close = () => { session.invalidate(); clearSensitive(); onClose() }

  const connectNovofon = async () => {
    if (!editable || session.gate.owner) return
    if (credential && !validIdentifier(credential)) { invalid('Проверьте ключ Novofon: пробелы и длина недопустимы.'); return }
    if (details.configured && confirmAction !== 'rotate:telephony') { setConfirmAction('rotate:telephony'); return }
    const key = credential; setCredential(''); setConfirmAction('')
    const beforeConfigured = details.configured
    await session.run(() => api.post('/mobile/v1/integrations/telephony', key ? { apiKey: key } : {}, { skipRefresh: true }), (response) => {
      const data = responseData(response)
      if (!isObject(data.setup) || !validIdentifier(data.setup.webhookSecret) || !/^novofon_[a-f0-9]{48}$/.test(data.setup.webhookSecret) || !validHttpsUrl(data.setup.webhookUrl)) throw new Error('INVALID_SETUP')
      const url = new URL(data.setup.webhookUrl)
      if (url.pathname !== '/api/telephony/novofon/webhook' || url.searchParams.get('secret') !== data.setup.webhookSecret || !url.searchParams.get('tenantId') || url.hash) throw new Error('INVALID_SETUP')
      let status: ProviderStatus | null = null
      try { status = readProvider('telephony', data) } catch { /* Preserve a valid issued secret; metadata remains unconfirmed. */ }
      return { secret: { title: 'Новый секрет Novofon', value: data.setup.webhookSecret, webhookUrl: data.setup.webhookUrl }, status }
    }, (issued) => ({ matches: (next) => {
      const status = next as ProviderStatus
      return issued.status?.enabled === true && issued.status.configured && status.enabled && status.configured && (!key || status.hasApiKey === true)
    }, message: beforeConfigured ? 'Novofon включён. Новый webhook выдан; скопируйте его сейчас.' : 'Novofon подключён. Скопируйте новый webhook сейчас.' }), (issued) => setSecret(issued.secret))
  }
  const connectAi = async () => {
    if (!editable || session.gate.owner || !aiProvider) return
    if (aiProvider === 'aitunnel' && !validIdentifier(credential)) { invalid(credential ? 'Проверьте ключ AITunnel: пробелы и длина недопустимы.' : 'Укажите ключ AITunnel'); return }
    if (!validIdentifier(transcriptionModel, 120) || !validIdentifier(analysisModel, 120)) { invalid('Проверьте названия моделей: пробелы и длина недопустимы.'); return }
    const key = credential; setCredential('')
    const selected = aiProvider
    await perform(() => api.post('/mobile/v1/integrations/ai', { provider: selected, ...(selected === 'aitunnel' ? { key } : {}), transcriptionModel, analysisModel }, { skipRefresh: true }), (next) => next.analysisProvider === selected && next.enabled && next.configured && (selected === 'artistcrm' || (next.analysisModel === analysisModel && next.transcriptionModel === transcriptionModel)), `${selected === 'artistcrm' ? 'ИИ Ведело' : 'AITunnel'} подключён`)
  }
  const updateAi = (patch: Record<string, unknown>, message: string) => {
    if (!editable || !aiProvider || details?.analysisProvider !== aiProvider) return
    if (patch.analysisModel && (!validIdentifier(analysisModel, 120) || !validIdentifier(transcriptionModel, 120))) { invalid('Проверьте названия моделей: пробелы и длина недопустимы.'); return }
    return perform(() => api.patch('/mobile/v1/integrations/ai', { provider: aiProvider, ...patch }, { skipRefresh: true }), (next) => next.analysisProvider === aiProvider && Object.entries(patch).every(([key, value]) => next[key as keyof ProviderStatus] === value), message)
  }
  const createLeadKey = async () => {
    if (!editable || session.gate.owner) return
    if (!validText(sourceName, 120)) { invalid('Укажите название источника без крайних пробелов, до 120 символов.'); return }
    const name = sourceName; const previous = new Set(details.keys?.map((key) => key.id))
    await session.run(() => api.post('/mobile/v1/integrations/public-leads', { name }, { skipRefresh: true }), (response) => {
      const data = responseData(response)
      if (!validIdentifier(data.issuedKey) || !/^lead_[a-f0-9]{48}$/.test(data.issuedKey)) throw new Error('INVALID_ISSUED_KEY')
      // Identify this exact issued key from the POST receipt, never from a later
      // arbitrary new item in the GET list. Ambiguous receipts stay unconfirmed.
      let candidates: ApiKeyMetadata[] = []
      try { candidates = (readProvider('public-leads', data).keys || []).filter((key) => !previous.has(key.id) && key.name === name && key.lastFour === String(data.issuedKey).slice(-4) && key.enabled) } catch { /* Keep the secret even if metadata is invalid. */ }
      return { value: data.issuedKey, key: candidates.length === 1 ? candidates[0] : null }
    }, (issued) => ({ matches: (next) => !!issued.key && (next as ProviderStatus).enabled && !!(next as ProviderStatus).keys?.some((key) => key.id === issued.key?.id && key.name === name && key.lastFour === issued.value.slice(-4) && key.enabled), message: 'API key создан. Скопируйте его сейчас.' }), (issued) => { setSourceName(''); setSecret({ title: 'Новый API key', value: issued.value }) })
  }
  const updateLead = (patch: Record<string, unknown>, matches: (state: ProviderStatus) => boolean, message: string) => editable && perform(() => api.patch('/mobile/v1/integrations/public-leads', patch, { skipRefresh: true }), matches, message)
  const deleteLeadKey = (key: ApiKeyMetadata) => {
    if (!details || blocked || session.gate.owner) return
    if (confirmAction !== `delete-key:${key.id}`) { setConfirmAction(`delete-key:${key.id}`); return }
    setConfirmAction('')
    return perform(() => api.delete('/mobile/v1/integrations/public-leads', { keyId: key.id }, { skipRefresh: true }), (next) => !!next.keys && !next.keys.some((item) => item.id === key.id), `Ключ «${key.name}» удалён`)
  }
  const disconnect = () => {
    if (!details || blocked || session.gate.owner) return
    if (confirmAction !== `disconnect:${provider}`) { setConfirmAction(`disconnect:${provider}`); return }
    setConfirmAction(''); setCredential('')
    return perform(() => api.delete(`/mobile/v1/integrations/${provider}`, undefined, { skipRefresh: true }), (next) => !next.enabled && (provider === 'ai' ? next.hasTranscriptionKey === false && next.analysisProvider === 'artistcrm' : provider === 'public-leads' ? next.keys?.length === 0 : !next.configured && !next.hasApiKey), `${titles[provider]} отключён, серверные ключи удалены`)
  }
  const copy = async (value: string, message: string) => {
    if (session.gate.owner) return
    const owner = Symbol('clipboard'); session.gate.owner = owner; const epoch = session.token()
    try {
      const result = await Clipboard.setStringAsync(value)
      if (result === false) throw new Error('CLIPBOARD_REJECTED')
      if (session.current(epoch)) session.setNotice({ tone: 'info', message })
    } catch { if (session.current(epoch)) session.setNotice({ tone: 'danger', message: 'Не удалось скопировать. Значение остаётся в открытой форме.' }) }
    finally { if (session.gate.owner === owner) session.gate.owner = null }
  }
  return <Surface testID={`integration-form-${provider}`}>
    <SectionTitle>{titles[provider]}</SectionTitle>
    <IntegrationFormState loading={session.initialLoading} error={session.loadError} notice={session.notice} needsRead={session.needsRead || (!details && !session.initialLoading)} working={session.working} onRead={() => void session.load()} />
    {details ? <>
      {!details.available ? <Notice tone="warning" message="Интеграция недоступна на текущем тарифе. Отключение сохранённой настройки остаётся доступным." /> : null}
      {provider === 'telephony' ? <>
        <Notice tone="info" message="Подключение выпускает новый webhook. Прежний адрес перестаёт работать; повторный выпуск требует подтверждения. Пауза через мобильный API не поддерживается." />
        <Field label="Ключ Novofon (необязательно)" value={credential} onChangeText={setCredential} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={editable} placeholder={details.hasApiKey ? 'Пустое поле сохраняет текущий ключ' : ''} />
        <Button title={confirmAction === 'rotate:telephony' ? 'Подтвердить выпуск нового webhook' : details.configured ? 'Выпустить новый webhook' : 'Подключить Novofon'} loading={session.working} disabled={!editable} onPress={connectNovofon} />
      </> : null}
      {provider === 'ai' ? <>
        {!parseAiProvider(details.analysisProvider) ? <Notice tone="warning" message="Сохранённый ИИ-провайдер не поддерживается в пользовательском приложении. Настройки на сервере не изменены. Для смены выберите и подключите ИИ Ведело или свой AITunnel." /> : null}
        <Text style={styles.muted}>ИИ Ведело оплачивается из баланса. Собственный AITunnel оплачивается у провайдера.</Text>
        {(['artistcrm', 'aitunnel'] as const).map((selected) => <Button key={selected} title={`${aiProvider === selected ? '✓ ' : ''}${selected === 'artistcrm' ? 'ИИ Ведело' : 'Свой AITunnel'}`} variant={aiProvider === selected ? 'primary' : 'secondary'} disabled={!editable} onPress={() => { setAiProvider(selected); setCredential(''); setConfirmAction(''); setAnalysisModel('gpt-4o-mini'); setTranscriptionModel('whisper-1') }} />)}
        {aiProvider === 'aitunnel' ? <>
          <Field label="API-ключ AITunnel" value={credential} onChangeText={setCredential} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={editable} />
          <Field label="Модель распознавания" value={transcriptionModel} onChangeText={setTranscriptionModel} autoCapitalize="none" autoCorrect={false} editable={editable} />
          <Field label="Модель AI-анализа" value={analysisModel} onChangeText={setAnalysisModel} autoCapitalize="none" autoCorrect={false} editable={editable} />
        </> : aiProvider === 'artistcrm' ? <Text style={styles.muted}>Ключ не нужен. Для операции нужен достаточный баланс.</Text> : null}
        {aiProvider ? <Button title={details.analysisProvider === aiProvider && details.configured ? aiProvider === 'artistcrm' ? 'Включить ИИ Ведело' : 'Заменить ключ и включить' : `Подключить ${aiProvider === 'artistcrm' ? 'ИИ Ведело' : 'AITunnel'}`} onPress={connectAi} loading={session.working} disabled={!editable} /> : null}
        {aiProvider && details.analysisProvider === aiProvider && details.configured ? <>
          {aiProvider === 'aitunnel' ? <Button title="Сохранить модель" variant="secondary" disabled={!editable} onPress={() => void updateAi({ transcriptionModel, analysisModel }, 'Модель AITunnel сохранена')} /> : null}
          <Button title={details.enabled ? 'Приостановить ИИ' : 'Возобновить ИИ'} variant="secondary" disabled={!editable} onPress={() => void updateAi({ enabled: !details.enabled }, details.enabled ? 'ИИ-интеграция приостановлена' : 'ИИ-интеграция включена')} />
        </> : null}
        <AiUsagePanel activeProvider={parseAiProvider(details.analysisProvider)} activeEnabled={details.enabled} activeConfigured={details.configured} />
      </> : null}
      {provider === 'public-leads' ? <>
        {details.endpoint ? <><Text selectable style={styles.value}>{details.endpoint}</Text><Button title="Скопировать endpoint" variant="secondary" onPress={() => void copy(details.endpoint!, 'Endpoint скопирован')} /></> : <Notice tone="warning" message="Адрес API не получен. Повторите чтение состояния." />}
        <Field label="Название нового источника" value={sourceName} onChangeText={setSourceName} maxLength={120} editable={editable} placeholder="Например, сайт или Tilda" />
        <Button title="Создать новый API key" onPress={createLeadKey} loading={session.working} disabled={!editable || (details.keys?.length || 0) >= 20} />
        {!details.keys?.length ? <Text style={styles.muted}>API-ключей пока нет</Text> : null}
        {details.keys?.map((key) => <View key={key.id} style={styles.key}>
          <Text style={styles.title}>{key.name}</Text><Text style={styles.muted}>•••• {key.lastFour} · {key.enabled ? 'Включён' : 'Выключен'}</Text>
          <Button title={key.enabled ? 'Отключить' : 'Включить'} accessibilityLabel={`${key.enabled ? 'Отключить' : 'Включить'} ключ ${key.name}`} variant="secondary" disabled={!editable} onPress={() => void updateLead({ keyId: key.id, enabled: !key.enabled }, (next) => !!next.keys?.some((item) => item.id === key.id && item.enabled === !key.enabled), 'Настройки ключа сохранены')} />
          <Button title={confirmAction === `delete-key:${key.id}` ? `Подтвердить удаление «${key.name}»` : 'Удалить'} accessibilityLabel={`Удалить ключ ${key.name}`} variant="danger" disabled={blocked} onPress={() => void deleteLeadKey(key)} />
        </View>)}
        {details.keys?.length ? <Button title={details.enabled ? 'Приостановить приём заявок' : 'Возобновить приём заявок'} variant="secondary" disabled={!editable} onPress={() => void updateLead({ enabled: !details.enabled }, (next) => next.enabled === !details.enabled, details.enabled ? 'Приём заявок приостановлен' : 'Приём заявок включён')} /> : null}
      </> : null}
      {(details.configured || details.enabled || (details.keys?.length || 0) > 0) ? <Button title={confirmAction === `disconnect:${provider}` ? 'Подтвердить отключение и удаление ключей' : 'Отключить интеграцию'} variant="danger" disabled={blocked} onPress={() => void disconnect()} /> : null}
      {confirmAction ? <Button title="Отмена подтверждения" variant="secondary" onPress={() => setConfirmAction('')} disabled={session.working} /> : null}
    </> : null}
    {secret ? <View style={styles.secret}>
      <Notice tone="warning" message="Секрет выдан один раз. Скопируйте его до закрытия формы или ухода с экрана. Приложение не сохраняет копию." />
      <Text style={styles.title}>{secret.title}</Text><Text selectable style={styles.value}>{secret.value}</Text>
      <Button title="Скопировать секрет" onPress={() => void copy(secret.value, 'Секрет скопирован')} />
      {secret.webhookUrl ? <><Text selectable style={styles.value}>{secret.webhookUrl}</Text><Button title="Скопировать webhook URL" variant="secondary" onPress={() => void copy(secret.webhookUrl!, 'Webhook URL скопирован')} /></> : null}
      <Button title="Закрыть секрет" variant="secondary" onPress={() => setSecret(null)} />
    </View> : null}
    <Button title="Закрыть без сохранения" variant="secondary" onPress={close} />
  </Surface>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  muted: { color: palette.cardMuted, fontSize: 12, lineHeight: 18 }, title: { color: palette.text, fontSize: 14, fontWeight: '700', flexShrink: 1 }, value: { color: palette.text, fontSize: 13, lineHeight: 19, flexShrink: 1 },
  key: { gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: 8 }, secret: { gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: palette.notice.warning.border, borderRadius: 8 },
})
