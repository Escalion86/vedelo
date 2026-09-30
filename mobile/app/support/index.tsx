import { SupportUserAccess } from '../../src/features/support/SupportUserAccess'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Button, EmptyState, ErrorNotice, PageHeader, Screen, StatusChip, Surface } from '../../src/shared/ui/components'
import { colors, spacing } from '../../src/shared/ui/theme'
import { listSupportTickets } from '../../src/features/support/api'
import type { SupportTicket } from '../../src/features/support/types'

const categories = { bug: 'Ошибка', idea: 'Идея', question: 'Вопрос' }
const statuses = { open: 'Открыт', in_progress: 'В работе', resolved: 'Решён' }

export default function SupportTicketsScreen() {
  return <SupportUserAccess><UserSupportTicketsScreen /></SupportUserAccess>
}

function UserSupportTicketsScreen() {
  const [items, setItems] = useState<SupportTicket[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const loadInitial = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await listSupportTickets()
      setItems(response.data)
      setCursor(response.meta.hasMore ? response.meta.nextCursor : null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить обращения') }
    finally { setLoading(false) }
  }, [])
  useFocusEffect(useCallback(() => { void loadInitial() }, [loadInitial]))
  const loadMore = async () => {
    if (!cursor) return
    setLoading(true); setError('')
    try {
      const response = await listSupportTickets({ cursor })
      setItems((current) => [...current, ...response.data])
      setCursor(response.meta.hasMore ? response.meta.nextCursor : null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить обращения') }
    finally { setLoading(false) }
  }
  return <Screen><PageHeader title="Обратная связь" subtitle="Диалог с разработчиком" action={ <Pressable accessibilityLabel="Новое обращение" style={styles.add} onPress={() => router.push('/support/new' as never)}><MaterialCommunityIcons name="plus" size={24} color="#fff" /></Pressable>} />{error ? <ErrorNotice message={error} /> : null}<View style={styles.list}>{items.map((ticket) => <Pressable key={ticket.id} onPress={() => router.push(`/support/${ticket.id}` as never)}><Surface><View style={styles.row}><View style={[styles.dot, ticket.unread && styles.dotUnread]} /><View style={styles.grow}><View style={styles.meta}><StatusChip label={categories[ticket.category]} tone="neutral" /><Text style={styles.muted}>{statuses[ticket.status]}</Text></View><Text style={[styles.title, ticket.unread && styles.unread]}>{ticket.title}</Text><Text style={styles.date}>{new Date(ticket.lastMessageAt).toLocaleString('ru-RU')}</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} /></View></Surface></Pressable>)}{!loading && !items.length ? <EmptyState title="Обращений пока нет" description="Создайте обращение, чтобы написать разработчику." /> : null}{cursor ? <Button title="Показать ещё" variant="secondary" onPress={loadMore} loading={loading} /> : null}{loading && !items.length ? <Text style={styles.loading}>Загружаем…</Text> : null}</View></Screen>
}
const styles = StyleSheet.create({ add: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, list: { gap: spacing.sm }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, grow: { flex: 1 }, dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.border }, dotUnread: { backgroundColor: colors.danger }, meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, title: { marginTop: 6, color: colors.text, fontSize: 15, fontWeight: '600' }, unread: { fontWeight: '800' }, muted: { color: colors.textMuted, fontSize: 12 }, date: { marginTop: 4, color: colors.textMuted, fontSize: 11 }, loading: { padding: spacing.lg, textAlign: 'center', color: colors.textMuted } })
