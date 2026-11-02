import { useCallback } from 'react'
import { Text } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { router, useFocusEffect } from 'expo-router'
import { api } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthProvider'
import { Button, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import { localDateLabel, record, serverId, successfulData } from '../calls/communication'
import { conversationProvider, providerLabels } from './conversationUi'

type UnreadItem = { key: string; clientId: string; clientName: string; unreadCount: number; providers: string[]; lastMessageText: string; lastMessageAt: string | null }
export const unreadConversationItems = (response: unknown): UnreadItem[] => {
  const data = successfulData(response)
  if (!record(data) || !Array.isArray(data.unreadItems)) throw new Error('invalid_summary')
  return data.unreadItems.map(value => {
    if (!record(value) || typeof value.key !== 'string' || !value.key || typeof value.clientName !== 'string' ||
      value.clientId && !serverId(value.clientId) || !Number.isFinite(value.unreadCount) || Number(value.unreadCount) <= 0 ||
      !Array.isArray(value.providers) || !value.providers.every(conversationProvider) || typeof value.lastMessageText !== 'string') throw new Error('invalid_unread_item')
    return { key: value.key, clientId: String(value.clientId || ''), clientName: value.clientName, unreadCount: Number(value.unreadCount), providers: value.providers,
      lastMessageText: value.lastMessageText, lastMessageAt: typeof value.lastMessageAt === 'string' ? value.lastMessageAt : null }
  })
}
export function UnreadConversationsSection() {
  const { user, authenticated } = useAuth(), { palette } = useTheme()
  const query = useQuery({ queryKey: ['unread-conversations', user?._id, user?.tenantId], enabled: authenticated,
    queryFn: async () => unreadConversationItems(await api.get('/clients/messenger-summary')), staleTime: 15000 })
  useFocusEffect(useCallback(() => { if (authenticated) void query.refetch() }, [authenticated, query.refetch]))
  return <Surface>
    <SectionTitle>Непрочитанные сообщения{query.data ? ` (${query.data.reduce((total, row) => total + row.unreadCount, 0)})` : ''}</SectionTitle>
    {query.isPending ? <Notice message="Загружаем сообщения…" /> : null}
    {query.isError ? <Notice tone="warning" message="Не удалось обновить непрочитанные сообщения." /> : null}
    {query.data?.map(item => <Surface key={item.key}>
      <Text style={{ color: palette.text, fontWeight: '700' }}>{item.clientName} · {item.unreadCount}</Text>
      <Text numberOfLines={3} style={{ color: palette.text }}>{item.lastMessageText || 'Новое сообщение'}</Text>
      <Text style={{ color: palette.cardMuted }}>{item.providers.map(provider => providerLabels[provider as keyof typeof providerLabels]).join(', ')} · {localDateLabel(item.lastMessageAt)}</Text>
      <Button title="Открыть переписку" variant="secondary" onPress={() => router.push(item.clientId ? { pathname: '/conversations', params: { clientId: item.clientId } } as never : '/conversations' as never)} />
    </Surface>)}
    {query.data?.length === 0 && !query.isError ? <Text style={{ color: palette.cardMuted }}>Новых сообщений нет</Text> : null}
    {query.isError ? <Button title="Обновить сообщения" variant="secondary" loading={query.isFetching} onPress={() => void query.refetch()} /> : null}
  </Surface>
}
