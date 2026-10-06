import { supportCursor } from '../../src/features/support/pagination'
import { paymentDate } from '../../src/features/profile/presentation'
import { useScreenLifetime } from '../../src/features/profile/useScreenLifetime'
import { useTheme, useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import { Notice } from '../../src/shared/ui/Notice'
import { SupportUserAccess } from '../../src/features/support/SupportUserAccess'
import { useCallback, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Button, EmptyState, ErrorNotice, PageHeader, Screen, StatusChip, Surface } from '../../src/shared/ui/components'
import { spacing, type Palette } from '../../src/shared/ui/theme'
import { listSupportTickets } from '../../src/features/support/api'
import type { SupportTicket } from '../../src/features/support/types'

const categories = { bug: 'Ошибка', idea: 'Идея', question: 'Вопрос' }
const statuses = { open: 'Открыт', in_progress: 'В работе', resolved: 'Решён' }

export default function SupportTicketsScreen() {
  return <SupportUserAccess><UserSupportTicketsScreen /></SupportUserAccess>
}

function UserSupportTicketsScreen() {
  const { palette } = useTheme()
  const styles = useThemeStyles(createStyles)
  const capture = useScreenLifetime()
  const revision = useRef(0), lock = useRef(false), seen = useRef(new Set<string>())
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [ready, setReady] = useState(false)
  const [items, setItems] = useState<SupportTicket[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async (next?: string) => {
    if (next && lock.current) return
    const generation = next ? revision.current : ++revision.current
    const current = capture()
    lock.current = true; setLoading(true); setError('')
    if (!next) { setItems([]); setCursor(null); setReady(false); seen.current.clear() }
    try {
      const params = { ...(status ? { status } : {}), ...(category ? { category } : {}), ...(next ? { cursor: next } : {}) }
      const response = await listSupportTickets(params)
      if (!current() || generation !== revision.current) return
      if (next) seen.current.add(next)
      setItems((previous) => [...new Map([...(next ? previous : []), ...response.data].map((item) => [item.id, item])).values()])
      const cursor = supportCursor(response.meta)
      const repeated = Boolean(cursor && (cursor === next || seen.current.has(cursor)))
      setCursor(repeated ? null : cursor); setReady(true)
      if (repeated) setError('Сервер повторил страницу. Обновите список обращений.')
    } catch (reason) { if (current() && generation === revision.current) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить обращения') }
    finally { if (current() && generation === revision.current) { lock.current = false; setLoading(false) } }
  }, [capture, status, category])
  useFocusEffect(useCallback(() => { void load(); return () => { revision.current++; lock.current = false } }, [load]))
  const loadMore = () => cursor ? load(cursor) : undefined
  return <Screen><PageHeader title="Обратная связь" subtitle="Диалог с разработчиком" action={ <Pressable accessibilityRole="button" accessibilityLabel="Новое обращение" style={styles.add} onPress={() => router.push('/support/new' as never)}><MaterialCommunityIcons name="plus" size={24} color={palette.onPrimary} /></Pressable>} /><Surface><View style={styles.filters}>{[['','Все статусы'],...Object.entries(statuses)].map(([value,title]) => <Button key={value} title={title} variant={status === value ? 'primary' : 'secondary'} onPress={() => setStatus(value)} />)}</View><View style={styles.filters}>{[['','Все типы'],...Object.entries(categories)].map(([value,title]) => <Button key={value} title={title} variant={category === value ? 'primary' : 'secondary'} onPress={() => setCategory(value)} />)}</View></Surface>{error ? <><ErrorNotice message={error} /><Button title="Обновить обращения" variant="secondary" onPress={() => load()} disabled={loading} /></> : null}<View style={styles.list}>{items.map((ticket) => <Pressable accessibilityRole="button" accessibilityLabel={`Открыть обращение: ${ticket.title}`} key={ticket.id} onPress={() => router.push(`/support/${ticket.id}` as never)}><Surface><View style={styles.row}><View style={[styles.dot, { backgroundColor: palette.notice[ticket.status === 'resolved' ? 'success' : ticket.status === 'in_progress' ? 'warning' : 'info'].text }]} /><View style={styles.grow}><View style={styles.meta}><StatusChip label={categories[ticket.category]} tone="neutral" /><StatusChip label={statuses[ticket.status]} tone={ticket.status === 'resolved' ? 'success' : ticket.status === 'in_progress' ? 'warning' : 'upcoming'} /></View><Text style={[styles.title, ticket.unread && styles.unread]}>{ticket.title}</Text>{ticket.unread ? <StatusChip label="Новый ответ" tone="warning" /> : null}<Text style={styles.date}>{paymentDate(ticket.lastMessageAt)}</Text></View><MaterialCommunityIcons name="chevron-right" size={22} color={palette.cardMuted} /></View></Surface></Pressable>)}{ready && !loading && !error && !items.length ? <EmptyState title="Обращений пока нет" description="Создайте обращение, чтобы написать разработчику." /> : null}{cursor ? <Button title="Показать ещё" variant="secondary" onPress={loadMore} loading={loading} /> : null}{loading && !items.length ? <Text style={styles.loading}>Загружаем…</Text> : null}</View></Screen>
}
const createStyles = (palette: Palette) => StyleSheet.create({ filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, add: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.primary }, list: { gap: spacing.sm }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, grow: { flex: 1 }, dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.border }, dotUnread: { backgroundColor: palette.primary }, meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }, title: { marginTop: 6, color: palette.text, fontSize: 15, fontWeight: '600' }, unread: { fontWeight: '800' }, muted: { color: palette.cardMuted, fontSize: 12 }, date: { marginTop: 4, color: palette.cardMuted, fontSize: 11 }, loading: { padding: spacing.lg, textAlign: 'center', color: palette.cardMuted } })
