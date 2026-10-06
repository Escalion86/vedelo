import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { api } from '../../shared/api/client'
import type { Conversation, ConversationProvider } from '../../shared/domain/types'
import { Button, EmptyState, Notice, PageHeader, Screen, StatusChip, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { communicationError, localDateLabel, serverId, successfulData } from '../calls/communication'
import { useCommunicationSession } from '../calls/useCommunicationSession'
import { checkedConversation, conversationStatus } from './conversationUi'

type ProviderState = { items: Conversation[]; error: string; ready: boolean }
const initial = (): Record<ConversationProvider, ProviderState> => ({ avito: { items: [], error: '', ready: false }, vk: { items: [], error: '', ready: false } })
export const ConversationsList = ({ clientId, eventId }: { clientId?: string; eventId?: string }) => {
  const styles = useThemeStyles(createStyles)
  const session = useCommunicationSession()
  const [filter, setFilter] = useState<'all' | ConversationProvider>('all')
  const [channels, setChannels] = useState(initial)
  const [loading, setLoading] = useState(true)
  const validScope = (clientId === undefined || serverId(clientId)) && (eventId === undefined || serverId(eventId))
  const load = useCallback(async () => {
    const token = session.begin(); if (token === null) return
    setLoading(true)
    const next = initial()
    const query = new URLSearchParams()
    if (clientId) query.set('clientId', clientId)
    if (eventId) query.set('eventId', eventId)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    if (validScope) await Promise.allSettled((['avito', 'vk'] as const).map(async (provider) => {
      try {
        const data = successfulData(await api.get<unknown>(`/mobile/v1/conversations/${provider}${suffix}`))
        if (!Array.isArray(data)) throw new Error('invalid_list')
        const items = data.map((item) => checkedConversation(item, provider))
        if (items.some((item) => clientId && item.clientId !== clientId || eventId && item.eventId !== eventId)) throw new Error('wrong_scope')
        next[provider] = { items, error: '', ready: true }
      } catch (reason) { next[provider] = { items: [], error: communicationError(reason, 'Не удалось загрузить диалоги. Повторите чтение.'), ready: false } }
    }))
    if (session.valid(token)) { setChannels(next); setLoading(false) }
    session.end(token)
  }, [clientId, eventId, validScope, session])
  useFocusEffect(useCallback(() => { void load() }, [load]))
  const providers = filter === 'all' ? ['avito', 'vk'] as const : [filter]
  const items = providers.flatMap((provider) => channels[provider].items).sort((a, b) => (new Date(b.lastMessageAt || 0).getTime() || 0) - (new Date(a.lastMessageAt || 0).getTime() || 0))
  return <Screen>
    <PageHeader title="Переписки" subtitle={clientId ? 'Диалоги клиента' : eventId ? 'Диалоги работы' : 'Avito и VK'} />
    <View style={styles.filters}>{([['all', 'Все'], ['avito', 'Avito'], ['vk', 'VK']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={({ pressed }) => [styles.filter, filter === value && styles.selected, pressed && styles.pressed]}><Text style={styles.text}>{label}</Text></Pressable>)}</View>
    {!validScope ? <Notice tone="danger" message="Некорректный ID клиента или работы. Для локальной записи переписки доступны после синхронизации." /> : <>
      {loading ? <Notice message={items.length ? 'Обновляем диалоги…' : 'Загружаем диалоги…'} /> : null}
      {providers.map((provider) => channels[provider].error ? <Notice key={provider} tone="danger" message={`${provider === 'avito' ? 'Avito' : 'VK'}: ${channels[provider].error}`} /> : null)}
      {items.map((conversation) => <Pressable key={`${conversation.provider}/${conversation._id}`} accessibilityRole="button" onPress={() => router.push(`/conversations/${conversation.provider}/${encodeURIComponent(conversation._id)}` as never)} style={({ pressed }) => pressed && styles.pressed}><Surface style={styles.card}>
        <View style={styles.row}><Text style={styles.title} numberOfLines={2}>{conversation.clientName || conversation.avitoItemTitle || 'Диалог'}</Text><StatusChip label={conversationStatus(conversation.status)} tone="neutral" /></View>
        <Text style={styles.text} numberOfLines={2}>{conversation.lastMessageText || 'Сообщений пока нет'}</Text>
        <View style={styles.row}><Text style={styles.muted}>{conversation.provider === 'avito' ? 'Avito' : 'VK'} · {localDateLabel(conversation.lastMessageAt)}</Text>{conversation.unreadCount ? <StatusChip label={`Непрочитано: ${conversation.unreadCount}`} tone="blue" /> : null}</View>
      </Surface></Pressable>)}
      {!loading && !items.length && providers.every((provider) => channels[provider].ready) ? <EmptyState title="Диалогов нет" description="Переписки появятся после подключения канала и первого сообщения клиента." /> : null}
      {!loading ? providers.map((provider) => channels[provider].ready && !channels[provider].items.length ? <Text key={provider} style={styles.muted}>{provider === 'avito' ? 'Avito' : 'VK'}: диалогов нет.</Text> : null) : null}
      <Button title="Обновить диалоги" variant="secondary" onPress={() => void load()} loading={loading} />
      <Text style={styles.muted}>Каждый канал показывает до 100 последних диалогов. Telegram Business пока недоступен в приложении.</Text>
    </>}
  </Screen>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, filter: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 4, backgroundColor: palette.surface }, selected: { backgroundColor: palette.rowSelected, borderColor: palette.primary }, pressed: { opacity: 0.82 },
  card: { padding: 10, gap: 6 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, title: { flex: 1, minWidth: 0, color: palette.text, fontSize: 14, fontWeight: '700' }, text: { color: palette.text, fontSize: 13, lineHeight: 19, flexShrink: 1 }, muted: { color: palette.cardMuted, fontSize: 12, lineHeight: 17, flexShrink: 1 },
})
