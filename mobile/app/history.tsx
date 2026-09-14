import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { router, useLocalSearchParams } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { loadCachedHistory, loadHistoryPage } from '../src/features/history/api'
import type { HistoryFilters, HistoryItem } from '../src/features/history/types'
import { Button, EmptyState, ErrorNotice, Field, PageHeader, Screen, Surface } from '../src/shared/ui/components'
import { colors, radius, spacing } from '../src/shared/ui/theme'
import { useWorkItemTerminology } from '../src/shared/hooks/useWorkItemTerminology'

const operationOptions = [['', 'Все действия'], ['create', 'Добавление'], ['update', 'Изменение'], ['delete', 'Удаление'], ['merge', 'Объединение']] as const
const sourceOptions = [['', 'Все источники'], ['web', 'Web'], ['android', 'Android'], ['public_api', 'API'], ['tilda', 'Tilda'], ['google_import', 'Календарь']] as const
const sourceLabel: Record<string, string> = { web: 'Web', android: 'Android', public_api: 'Public API', tilda: 'Tilda', google_import: 'Google Calendar', avito: 'Avito', vk: 'VK', telephony: 'Телефония' }
const semanticLabel: Record<string, string> = { task_created: 'Добавлена задача', task_deleted: 'Удалена задача', task_completed: 'Выполнена задача', task_rescheduled: 'Перенесена задача', task_updated: 'Изменена задача' }

const valueText = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'Не указано'
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString('ru-RU')
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' ? String((item as { title?: string }).title || 'Запись') : String(item)).join(', ') || 'Пусто'
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).filter((item) => typeof item !== 'object' && item !== '').join(', ') || 'Изменено'
  return String(value)
}

const Choice = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
  <Pressable style={[styles.choice, active && styles.choiceActive]} onPress={onPress}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>
)

const HistoryRow = ({ item }: { item: HistoryItem }) => {
  const [open, setOpen] = useState(false)
  const openEntity = () => {
    if (!item.entityExists) return
    if (item.entityType === 'event') router.push(`/events/${item.entityId}` as never)
    if (item.entityType === 'client') router.push(`/clients/${item.entityId}` as never)
    if (item.entityType === 'transaction') router.push(`/finance/edit/${item.entityId}` as never)
  }
  return <Surface><Pressable style={styles.rowHeader} onPress={() => setOpen((value) => !value)}><View style={styles.icon}><MaterialCommunityIcons name="history" size={21} color={colors.primary} /></View><View style={styles.grow}><Text style={styles.title}>{semanticLabel[item.semanticAction || ''] || item.summary || 'Изменение'}</Text><Text style={styles.entity} numberOfLines={1}>{item.entityLabel}</Text><Text style={styles.meta}>{new Date(item.occurredAt).toLocaleString('ru-RU')} · {item.actorLabel || 'Пользователь'} · {sourceLabel[item.source || ''] || item.source || 'Web'}</Text></View><MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} /></Pressable>{open ? <View style={styles.changes}>{item.changes?.length ? item.changes.map((change) => <View key={change.field} style={styles.change}><Text style={styles.changeLabel}>{change.label}</Text><Text style={styles.old}>{valueText(change.oldValue)}</Text><MaterialCommunityIcons name="arrow-right" size={16} color={colors.textMuted} /><Text style={styles.next}>{valueText(change.newValue)}</Text></View>) : <Text style={styles.meta}>Подробные изменения отсутствуют</Text>}{item.entityExists ? <Button title="Открыть карточку" variant="secondary" onPress={openEntity} /> : null}</View> : null}</Surface>
}

export default function HistoryScreen() {
  const terms = useWorkItemTerminology()
  const entityOptions = [['', 'Все'], ['event', terms.pluralCapitalized], ['client', 'Клиенты'], ['transaction', 'Финансы']] as const
  const params = useLocalSearchParams<{ entityType?: string; entityId?: string }>()
  const fixedEntity = Boolean(params.entityType && params.entityId)
  const [entityType, setEntityType] = useState(params.entityType || '')
  const [operation, setOperation] = useState('')
  const [source, setSource] = useState('')
  const [actorId, setActorId] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [items, setItems] = useState<HistoryItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState('')
  const actorOptions = useMemo(() => [['', 'Все авторы'], ...Array.from(new Map(items.filter((item) => item.actorId).map((item) => [item.actorId || '', item.actorLabel || 'Пользователь'])).entries())] as [string, string][], [items])
  const filters = useMemo<HistoryFilters>(() => ({ entityType, entityId: params.entityId || '', operation, source, actorId, search: search.trim(), dateFrom, dateTo: dateTo ? `${dateTo}T23:59:59.999` : '' }), [actorId, dateFrom, dateTo, entityType, operation, params.entityId, search, source])

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    const network = await NetInfo.fetch()
    setOffline(!network.isConnected)
    try {
      if (!network.isConnected) {
        setItems(await loadCachedHistory(filters)); setCursor(null); setHasMore(false); return
      }
      const response = await loadHistoryPage(filters)
      setItems(response.data); setCursor(response.meta.nextCursor || null); setHasMore(response.meta.hasMore)
    } catch (reason) {
      const cached = await loadCachedHistory(filters)
      setItems(cached); setOffline(cached.length > 0)
      if (!cached.length) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить историю')
    } finally { setLoading(false) }
  }, [filters])

  useEffect(() => { const timer = setTimeout(() => { void reload() }, 250); return () => clearTimeout(timer) }, [reload])
  const loadMore = async () => {
    if (!cursor || loading) return
    setLoading(true)
    try { const response = await loadHistoryPage(filters, cursor); setItems((current) => [...current, ...response.data.filter((item) => !current.some((old) => old.id === item.id))]); setCursor(response.meta.nextCursor || null); setHasMore(response.meta.hasMore) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить продолжение') }
    finally { setLoading(false) }
  }

  return <Screen><PageHeader title={fixedEntity ? 'История карточки' : 'История действий'} subtitle="Изменения заявок, клиентов и финансов" />{offline ? <View style={styles.offline}><Text style={styles.offlineText}>Показана последняя сохранённая история. Новые offline-действия появятся после синхронизации.</Text></View> : null}{!fixedEntity ? <Surface><Field label="Поиск" value={search} onChangeText={setSearch} placeholder="Карточка или пользователь" /><Text style={styles.filterTitle}>Карточки</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{entityOptions.map(([value, label]) => <Choice key={value} label={label} active={entityType === value} onPress={() => setEntityType(value)} />)}</ScrollView><Text style={styles.filterTitle}>Действия</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{operationOptions.map(([value, label]) => <Choice key={value} label={label} active={operation === value} onPress={() => setOperation(value)} />)}</ScrollView><Text style={styles.filterTitle}>Источник</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{sourceOptions.map(([value, label]) => <Choice key={value} label={label} active={source === value} onPress={() => setSource(value)} />)}</ScrollView><Text style={styles.filterTitle}>Автор</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>{actorOptions.map(([value, label]) => <Choice key={value} label={label} active={actorId === value} onPress={() => setActorId(value)} />)}</ScrollView><View style={styles.dates}><Field label="С даты" value={dateFrom} onChangeText={setDateFrom} placeholder="2026-08-01" /><Field label="По дату" value={dateTo} onChangeText={setDateTo} placeholder="2026-08-31" /></View></Surface> : null}<View style={styles.list}>{items.map((item) => <HistoryRow key={item.id} item={item} />)}{loading ? <ActivityIndicator color={colors.primary} /> : null}{error ? <ErrorNotice message={error} /> : null}{!loading && !error && items.length === 0 ? <EmptyState title="История пока пуста" description="Новые действия появятся после изменения данных." /> : null}{hasMore ? <Button title="Показать ещё" variant="secondary" onPress={loadMore} loading={loading} /> : null}</View></Screen>
}

const styles = StyleSheet.create({ list: { gap: spacing.md }, rowHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, grow: { flex: 1 }, title: { color: colors.text, fontSize: 14, fontWeight: '800' }, entity: { color: colors.text, fontSize: 13, marginTop: 3 }, meta: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 }, changes: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, change: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', paddingVertical: spacing.xs }, changeLabel: { width: '100%', color: colors.text, fontSize: 12, fontWeight: '700' }, old: { flex: 1, color: colors.textMuted, fontSize: 12 }, next: { flex: 1, color: colors.text, fontSize: 12 }, choices: { gap: 6 }, choice: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }, choiceActive: { backgroundColor: colors.primary }, choiceText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' }, choiceTextActive: { color: '#FFFFFF' }, filterTitle: { color: colors.text, fontSize: 12, fontWeight: '700' }, dates: { flexDirection: 'row', gap: spacing.sm }, offline: { backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: spacing.md }, offlineText: { color: colors.blue, fontSize: 12, lineHeight: 18 } })
