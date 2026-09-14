import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { api } from '../../shared/api/client'
import {
  Button,
  ErrorNotice,
  Field,
  SectionTitle,
  StatusChip,
  Surface,
} from '../../shared/ui/components'
import { colors, radius, spacing } from '../../shared/ui/theme'
import { AiUsagePanel } from './AiUsagePanel'

type Provider = 'telephony' | 'ai' | 'public-leads'
type AiProvider = 'artistcrm' | 'aitunnel' | 'deepseek'
type ApiKeyMetadata = {
  id: string
  name: string
  enabled: boolean
  lastFour: string
}
type ManagedStatus = {
  provider?: Provider
  available: boolean
  enabled?: boolean
  configured?: boolean
  hasApiKey?: boolean
  status?: string
  transcriptionModel?: string
  analysisModel?: string
  analysisProvider?: AiProvider
  transcriptionProvider?: string
  hasTranscriptionKey?: boolean
  canUseDeepseek?: boolean
  platformConfigured?: boolean
  endpoint?: string
  keys?: ApiKeyMetadata[]
}
type OneTimeSecret = {
  title: string
  value: string
  webhookUrl?: string
}

const titles: Record<Provider, string> = {
  telephony: 'Novofon',
  ai: 'ИИ-провайдер',
  'public-leads': 'Public Leads API',
}

const statusLabel = (status?: ManagedStatus) => {
  if (!status?.available) return 'Недоступно'
  if (status.enabled && status.configured) return 'Подключено'
  if (status.enabled) return 'Нужна настройка'
  if (status.configured) return 'Приостановлено'
  return 'Не подключено'
}

const statusTone = (status?: ManagedStatus) => status?.enabled && status?.configured
  ? 'success' as const
  : status?.available
    ? 'warning' as const
    : 'neutral' as const

export function ManagedIntegrationsSection({
  overview,
  onChanged,
}: {
  overview: {
    telephony?: ManagedStatus
    ai?: ManagedStatus
    publicLeadApi?: ManagedStatus
  }
  onChanged: () => Promise<void>
}) {
  const [selected, setSelected] = useState<Provider | null>(null)
  const [details, setDetails] = useState<ManagedStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [secret, setSecret] = useState<OneTimeSecret | null>(null)
  const [credential, setCredential] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [transcriptionModel, setTranscriptionModel] = useState('whisper-1')
  const [analysisModel, setAnalysisModel] = useState('gpt-4o-mini')
  const [aiProvider, setAiProvider] = useState<AiProvider>('artistcrm')
  const [confirmAction, setConfirmAction] = useState('')

  const clearSensitiveState = () => {
    setCredential('')
    setSecret(null)
    setConfirmAction('')
  }

  const close = () => {
    clearSensitiveState()
    setSelected(null)
    setDetails(null)
    setSourceName('')
    setError('')
    setMessage('')
  }

  const refresh = async (provider: Provider) => {
    const response = await api.get<{ success: true; data: ManagedStatus }>(
      `/mobile/v1/integrations/${provider}`
    )
    setDetails(response.data)
    if (provider === 'ai') {
      setAiProvider(response.data.analysisProvider || 'artistcrm')
      setTranscriptionModel(response.data.transcriptionModel || 'whisper-1')
      setAnalysisModel(
        response.data.analysisModel ||
          (response.data.analysisProvider === 'deepseek'
            ? 'deepseek-v4-flash'
            : 'gpt-4o-mini')
      )
    }
    return response.data
  }

  const open = async (provider: Provider) => {
    setLoading(true)
    setError('')
    setMessage('')
    clearSensitiveState()
    setSelected(provider)
    setDetails(null)
    try {
      await refresh(provider)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось открыть интеграцию')
    } finally {
      setLoading(false)
    }
  }

  const finishMutation = async (provider: Provider, nextMessage: string) => {
    setMessage(nextMessage)
    await refresh(provider)
    await onChanged()
  }

  const connectNovofon = async () => {
    if (!selected) return
    if (details?.configured && confirmAction !== 'rotate-novofon') {
      setConfirmAction('rotate-novofon')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    setSecret(null)
    try {
      const response = await api.post<{
        success: true
        data: ManagedStatus & {
          setup: { webhookSecret: string; webhookUrl: string }
        }
      }>('/mobile/v1/integrations/telephony', {
        ...(credential ? { apiKey: credential } : {}),
      })
      setCredential('')
      setConfirmAction('')
      setSecret({
        title: 'Новый секрет Novofon',
        value: response.data.setup.webhookSecret,
        webhookUrl: response.data.setup.webhookUrl,
      })
      await finishMutation('telephony', 'Novofon включён. Скопируйте новый webhook сейчас.')
    } catch (reason) {
      setCredential('')
      setError(reason instanceof Error ? reason.message : 'Не удалось подключить Novofon')
    } finally {
      setLoading(false)
    }
  }

  const connectAi = async () => {
    if (aiProvider !== 'artistcrm' && !credential.trim()) {
      setError(`Укажите ключ ${aiProvider === 'deepseek' ? 'DeepSeek' : 'AITunnel'}`)
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await api.post('/mobile/v1/integrations/ai', {
        provider: aiProvider,
        ...(aiProvider === 'artistcrm' ? {} : { key: credential }),
        transcriptionModel,
        analysisModel,
      })
      setCredential('')
      await finishMutation(
        'ai',
        `${aiProvider === 'deepseek' ? 'DeepSeek' : aiProvider === 'artistcrm' ? 'ИИ Ведело' : 'AITunnel'} подключён`
      )
    } catch (reason) {
      setCredential('')
      setError(reason instanceof Error ? reason.message : 'Не удалось подключить ИИ-провайдера')
    } finally {
      setLoading(false)
    }
  }

  const updateAi = async (patch: Record<string, unknown>, nextMessage: string) => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await api.patch('/mobile/v1/integrations/ai', patch)
      await finishMutation('ai', nextMessage)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить ИИ-провайдера')
    } finally {
      setLoading(false)
    }
  }

  const createLeadKey = async () => {
    if (!sourceName.trim()) {
      setError('Укажите название источника')
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    setSecret(null)
    try {
      const response = await api.post<{
        success: true
        data: ManagedStatus & { issuedKey: string }
      }>('/mobile/v1/integrations/public-leads', { name: sourceName })
      setSourceName('')
      setSecret({
        title: 'Новый API key',
        value: response.data.issuedKey,
      })
      await finishMutation('public-leads', 'API key создан. Скопируйте его сейчас.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось создать API key')
    } finally {
      setLoading(false)
    }
  }

  const updateLeadKey = async (keyId: string, patch: Record<string, unknown>) => {
    setLoading(true)
    setError('')
    try {
      await api.patch('/mobile/v1/integrations/public-leads', { keyId, ...patch })
      await finishMutation('public-leads', 'Настройки ключа сохранены')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось изменить API key')
    } finally {
      setLoading(false)
    }
  }

  const updateLeadStatus = async (enabled: boolean) => {
    setLoading(true)
    setError('')
    try {
      await api.patch('/mobile/v1/integrations/public-leads', { enabled })
      await finishMutation(
        'public-leads',
        enabled ? 'Приём заявок включён' : 'Приём заявок приостановлен'
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось изменить приём заявок')
    } finally {
      setLoading(false)
    }
  }

  const deleteLeadKey = async (key: ApiKeyMetadata) => {
    if (confirmAction !== `delete-key:${key.id}`) {
      setConfirmAction(`delete-key:${key.id}`)
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.delete('/mobile/v1/integrations/public-leads', { keyId: key.id })
      setConfirmAction('')
      await finishMutation('public-leads', `Ключ «${key.name}» удалён`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось удалить API key')
    } finally {
      setLoading(false)
    }
  }

  const disconnect = async (provider: Provider) => {
    if (confirmAction !== `disconnect:${provider}`) {
      setConfirmAction(`disconnect:${provider}`)
      return
    }
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await api.delete(`/mobile/v1/integrations/${provider}`)
      clearSensitiveState()
      await finishMutation(provider, `${titles[provider]} отключён, серверные ключи удалены`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отключить интеграцию')
    } finally {
      setLoading(false)
    }
  }

  const copy = async (value: string, copiedMessage: string) => {
    await Clipboard.setStringAsync(value)
    setMessage(copiedMessage)
  }

  const cards: Array<{
    provider: Provider
    status?: ManagedStatus
    icon: keyof typeof MaterialCommunityIcons.glyphMap
    description: string
  }> = [
    {
      provider: 'telephony',
      status: overview.telephony,
      icon: 'phone-voip',
      description: 'IP-телефония и записи разговоров',
    },
    {
      provider: 'ai',
      status: overview.ai,
      icon: 'creation-outline',
      description: 'ИИ Ведело или собственный AITunnel',
    },
    {
      provider: 'public-leads',
      status: overview.publicLeadApi,
      icon: 'api',
      description: 'Заявки с сайта, Tilda и других источников',
    },
  ]

  return <>
    <Surface>
      <SectionTitle>Телефония, AI и входящие заявки</SectionTitle>
      {cards.map((card) => <View key={card.provider} style={styles.integration}>
        <View style={styles.round}>
          <MaterialCommunityIcons name={card.icon} size={21} color={colors.primary} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.title}>{titles[card.provider]}</Text>
          <Text style={styles.muted}>{card.description}</Text>
        </View>
        <StatusChip label={statusLabel(card.status)} tone={statusTone(card.status)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Настроить ${titles[card.provider]}`}
          hitSlop={10}
          onPress={() => open(card.provider)}
          disabled={!card.status?.available || loading}
        >
          <MaterialCommunityIcons name="chevron-right" size={26} color={colors.textMuted} />
        </Pressable>
      </View>)}
    </Surface>

    {selected ? <Surface>
      <SectionTitle>{titles[selected]}</SectionTitle>
      {error ? <ErrorNotice message={error} /> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      {selected === 'telephony' ? <>
        <Text style={styles.muted}>При подключении выпускается новый webhook. Старый адрес сразу перестаёт работать.</Text>
        <Field
          label="Ключ Novofon (необязательно)"
          value={credential}
          onChangeText={setCredential}
          secureTextEntry
          autoCapitalize="none"
          placeholder={details?.hasApiKey ? 'Оставьте пустым, чтобы сохранить текущий' : ''}
        />
        <Button
          title={confirmAction === 'rotate-novofon'
            ? 'Подтвердить выпуск нового webhook'
            : details?.configured
              ? 'Выпустить новый webhook'
              : 'Подключить Novofon'}
          onPress={connectNovofon}
          loading={loading}
        />
      </> : null}

      {selected === 'ai' ? <>
        <Text style={styles.muted}>Общий ИИ Ведело оплачивается из баланса. При собственном AITunnel списаний со стороны Ведело нет.</Text>
        <Button
          title={aiProvider === 'artistcrm' ? '✓ ИИ Ведело' : 'ИИ Ведело'}
          variant={aiProvider === 'artistcrm' ? undefined : 'secondary'}
          onPress={() => {
            setAiProvider('artistcrm')
            setAnalysisModel('gpt-4o-mini')
            setTranscriptionModel('whisper-1')
            setCredential('')
          }}
          disabled={loading}
        />
        <Button
          title={aiProvider === 'aitunnel' ? '✓ Свой AITunnel' : 'Свой AITunnel'}
          variant={aiProvider === 'aitunnel' ? undefined : 'secondary'}
          onPress={() => {
            setAiProvider('aitunnel')
            setAnalysisModel('gpt-4o-mini')
            setCredential('')
          }}
          disabled={loading}
        />
        {details?.canUseDeepseek ? <Button
          title={aiProvider === 'deepseek' ? '✓ DeepSeek' : 'DeepSeek'}
          variant={aiProvider === 'deepseek' ? undefined : 'secondary'}
          onPress={() => {
            setAiProvider('deepseek')
            setAnalysisModel('deepseek-v4-flash')
            setCredential('')
          }}
          disabled={loading}
        /> : null}
        {aiProvider !== 'artistcrm' ? <Field
          label={`API-ключ ${aiProvider === 'deepseek' ? 'DeepSeek' : 'AITunnel'}`}
          value={credential}
          onChangeText={setCredential}
          secureTextEntry
          autoCapitalize="none"
        /> : <Text style={styles.muted}>
          Ключ не нужен. Перед запросом баланс должен быть больше средней стоимости такой операции.
        </Text>}
        {aiProvider === 'aitunnel' ? <Field
          label="Модель распознавания"
          value={transcriptionModel}
          onChangeText={setTranscriptionModel}
          autoCapitalize="none"
        /> : aiProvider === 'deepseek' ? <Text style={styles.muted}>
          DeepSeek работает с готовым текстом. Расшифровка записей звонков требует отдельно подключённого AITunnel.
        </Text> : null}
        {aiProvider !== 'artistcrm' ? <Field label="Модель AI-анализа" value={analysisModel} onChangeText={setAnalysisModel} autoCapitalize="none" /> : null}
        <Button
          title={details?.analysisProvider === aiProvider && details?.configured
            ? aiProvider === 'artistcrm' ? 'Включить ИИ Ведело' : 'Заменить ключ и включить'
            : `Подключить ${aiProvider === 'deepseek' ? 'DeepSeek' : aiProvider === 'artistcrm' ? 'ИИ Ведело' : 'AITunnel'}`}
          onPress={connectAi}
          loading={loading}
        />
        {details?.analysisProvider === aiProvider && details?.configured ? <>
          {aiProvider !== 'artistcrm' ? <Button
            title="Сохранить модель"
            variant="secondary"
            onPress={() => updateAi(
              { provider: aiProvider, transcriptionModel, analysisModel },
              `Модель ${aiProvider === 'deepseek' ? 'DeepSeek' : 'AITunnel'} сохранена`
            )}
            disabled={loading}
          /> : null}
          <Button
            title={details.enabled ? 'Приостановить ИИ' : 'Возобновить ИИ'}
            variant="secondary"
            onPress={() => updateAi(
              { provider: aiProvider, enabled: !details.enabled },
              details.enabled ? 'ИИ-интеграция приостановлена' : 'ИИ-интеграция включена'
            )}
            disabled={loading}
          />
        </> : null}
        {details ? (
          <AiUsagePanel
            activeProvider={aiProvider}
            isDeveloper={Boolean(details.canUseDeepseek)}
          />
        ) : null}
      </> : null}

      {selected === 'public-leads' ? <>
        <Text selectable style={styles.endpoint}>{details?.endpoint || 'Endpoint загружается…'}</Text>
        {details?.endpoint ? <Button title="Скопировать endpoint" variant="secondary" onPress={() => copy(details.endpoint || '', 'Endpoint скопирован')} /> : null}
        <Field label="Название нового источника" value={sourceName} onChangeText={setSourceName} placeholder="Например, сайт или Tilda" />
        <Button title="Создать новый API key" onPress={createLeadKey} loading={loading} />
        {(details?.keys || []).map((key) => <View key={key.id} style={styles.keyRow}>
          <View style={styles.grow}>
            <Text style={styles.title}>{key.name}</Text>
            <Text style={styles.muted}>•••• {key.lastFour}</Text>
          </View>
          <Button
            title={key.enabled ? 'Отключить' : 'Включить'}
            variant="secondary"
            onPress={() => updateLeadKey(key.id, { enabled: !key.enabled })}
            disabled={loading}
          />
          <Button
            title={confirmAction === `delete-key:${key.id}` ? 'Подтвердить удаление' : 'Удалить'}
            variant="danger"
            onPress={() => deleteLeadKey(key)}
            disabled={loading}
          />
        </View>)}
        {(details?.keys || []).length > 0 ? <Button
          title={details?.enabled ? 'Приостановить приём заявок' : 'Возобновить приём заявок'}
          variant="secondary"
          onPress={() => updateLeadStatus(!details?.enabled)}
          disabled={loading}
        /> : null}
      </> : null}

      {secret ? <View style={styles.secretBox}>
        <Text style={styles.secretTitle}>{secret.title}</Text>
        <Text selectable style={styles.secretValue}>{secret.value}</Text>
        <Button title="Скопировать секрет" onPress={() => copy(secret.value, 'Секрет скопирован')} />
        {secret.webhookUrl ? <>
          <Text selectable style={styles.secretValue}>{secret.webhookUrl}</Text>
          <Button title="Скопировать webhook URL" variant="secondary" onPress={() => copy(secret.webhookUrl || '', 'Webhook URL скопирован')} />
        </> : null}
        <Text style={styles.warning}>После закрытия это значение больше не будет показано. При необходимости выпустите новое.</Text>
      </View> : null}

      {details?.configured && selected !== 'public-leads' ? <Button
        title={confirmAction === `disconnect:${selected}`
          ? 'Подтвердить отключение и удаление ключей'
          : 'Отключить интеграцию'}
        variant="danger"
        onPress={() => disconnect(selected)}
        disabled={loading}
      /> : null}
      {selected === 'public-leads' && (details?.keys || []).length > 0 ? <Button
        title={confirmAction === 'disconnect:public-leads'
          ? 'Подтвердить удаление всех API-ключей'
          : 'Отключить и удалить все API-ключи'}
        variant="danger"
        onPress={() => disconnect('public-leads')}
        disabled={loading}
      /> : null}
      <Button title="Закрыть" variant="secondary" onPress={close} disabled={loading} />
      <Text style={styles.privacy}>Ключи находятся только в памяти этой формы и не сохраняются в SecureStore, SQLite или кэше запросов.</Text>
    </Surface> : null}
  </>
}

const styles = StyleSheet.create({
  integration: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  success: { color: colors.success, fontSize: 13, fontWeight: '700' },
  privacy: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  warning: { color: colors.warning, fontSize: 12, lineHeight: 18 },
  endpoint: { color: colors.primary, fontSize: 13, lineHeight: 19 },
  keyRow: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  secretBox: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  secretTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  secretValue: { color: colors.text, fontSize: 13, lineHeight: 19 },
})
