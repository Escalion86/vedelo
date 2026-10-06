import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { api } from '../../shared/api/client'
import { Button, ErrorNotice, Notice, Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { ManagedIntegrationsSection } from './ManagedIntegrationsSection'
import { CredentialIntegrationForm } from './CredentialIntegrationForm'
import { GoogleCalendarForm } from './GoogleCalendarForm'
import { TelegramSection } from './TelegramSection'
import { IntegrationRow } from './IntegrationRow'
import { readOverview, readStatus, safeError, titles, type GoogleStatus, type IntegrationOverview, type ManagedProvider, type Provider, type ProviderStatus } from './integrationContract'
import type { OperationGate } from './useIntegrationSession'
const rows = [
  ['google-calendar', 'calendar-outline', 'Синхронизация работ и следующих контактов'],
  ['avito', 'storefront-outline', 'Входящие заявки и ответы клиентам'],
  ['vk', 'alpha-v-circle-outline', 'Сообщения сообщества и заявки'],
  ['telephony', 'phone-voip', 'IP-телефония и записи разговоров'],
  ['ai', 'creation-outline', 'ИИ Ведело или собственный AITunnel'],
  ['public-leads', 'api', 'Заявки с сайта, Tilda и других источников'],
  ['telegram', 'send-outline', 'Состояние Telegram Business'],
] as const
const noReload = async () => {}
export function IntegrationsSection() {
  const { palette } = useTheme(); const styles = useThemeStyles(createStyles)
  const [overview, setOverview] = useState<IntegrationOverview | null>(null)
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [aiError, setAiError] = useState('')
  const [selected, setSelected] = useState<Provider | 'telegram' | null>(null)
  const gate = useRef<OperationGate>({ owner: null })
  const lifetime = useRef({ active: false, revision: 0, loading: false })
  const load = useCallback(async () => {
    if (!lifetime.current.active || lifetime.current.loading || gate.current.owner) return
    lifetime.current.loading = true; const revision = ++lifetime.current.revision
    setLoading(true); setError(''); setAiError('')
    // Dedicated AI GET resolves the documented overview inconsistency. It is
    // independent, so either failure keeps the other providers usable.
    const [list, ai] = await Promise.allSettled([api.get('/mobile/v1/integrations/status'), api.get('/mobile/v1/integrations/ai')])
    if (!lifetime.current.active || lifetime.current.revision !== revision) return
    const next: IntegrationOverview = {}
    try { if (list.status === 'rejected') throw list.reason; Object.assign(next, readOverview(list.value)) }
    catch (reason) { setError(safeError(reason, 'Не удалось загрузить список интеграций. Повторите чтение.')) }
    try { if (ai.status === 'rejected') throw ai.reason; next.ai = readStatus('ai', ai.value) }
    catch (reason) { setAiError(safeError(reason, 'Состояние ИИ не получено. Откройте настройки для повторного чтения.')) }
    setOverview(next); setLoading(false); lifetime.current.loading = false
  }, [])
  useFocusEffect(useCallback(() => {
    lifetime.current.active = true; lifetime.current.loading = false; setSelected(null); void load()
    return () => { lifetime.current.active = false; ++lifetime.current.revision; lifetime.current.loading = false; setSelected(null) }
  }, [load]))
  const updateStatus = useCallback((provider: Provider, state: GoogleStatus | ProviderStatus) => {
    // An old overview read must not overwrite a newer targeted read/mutation.
    ++lifetime.current.revision; lifetime.current.loading = false; setLoading(false)
    setOverview((previous) => ({ ...previous, [provider]: state }))
    if (provider === 'ai') setAiError('')
  }, [])
  const close = () => setSelected(null)
  return <>
    {loading ? <ActivityIndicator accessibilityLabel="Загрузка списка интеграций" color={palette.primary} /> : null}
    {error ? <ErrorNotice message={error} /> : null}
    {aiError ? <Notice tone="warning" message={aiError} /> : null}
    {overview ? <Surface testID="integrations-list">
      {rows.map(([provider, icon, description]) => <IntegrationRow key={provider} title={titles[provider]} icon={icon} description={description} state={overview[provider]} selected={selected === provider} onPress={() => { if (lifetime.current.active) setSelected((previous) => previous === provider ? null : provider) }} />)}
    </Surface> : null}
    {selected === 'google-calendar' ? <GoogleCalendarForm gate={gate.current} onStatus={(state) => updateStatus('google-calendar', state)} onClose={close} /> : null}
    {selected === 'avito' || selected === 'vk' ? <CredentialIntegrationForm key={selected} provider={selected} gate={gate.current} onStatus={(state) => updateStatus(selected, state)} onClose={close} /> : null}
    {selected === 'telephony' || selected === 'ai' || selected === 'public-leads' ? <ManagedIntegrationsSection key={selected} initialProvider={selected as ManagedProvider} overview={{}} onChanged={noReload} gate={gate.current} onStatus={updateStatus} onClose={close} /> : null}
    {selected === 'telegram' ? <TelegramSection state={overview?.telegram as ProviderStatus | undefined} /> : null}
    <Button title={error ? 'Повторить загрузку интеграций' : 'Обновить статусы'} variant="secondary" loading={loading} onPress={() => void load()} />
    <Button title="Открыть переписки Avito и VK" variant="secondary" onPress={() => router.push('/conversations' as never)} />
    <Text style={styles.muted}>Секреты интеграций хранятся на сервере. Введённые и одноразовые значения доступны только в открытой форме.</Text>
  </>
}
const createStyles = (palette: Palette) => StyleSheet.create({ muted: { color: palette.cardMuted, fontSize: 12, lineHeight: 18 } })
