import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Client, Event, Service, Transaction } from '../../shared/domain/types'
import type { TaskChange } from '../../shared/domain/taskActions'
import { useCachedEntities } from '../../shared/hooks/useCachedEntities'
import { useSyncRunState } from '../../shared/hooks/useSyncRunState'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { getSyncStatePresentation } from '../../shared/domain/syncStatePresentation'
import { getSyncQueueCounts } from '../../shared/sync/syncState'
import { getOutboxSummary } from '../../shared/storage/outbox'
import { runSync } from '../../shared/sync/syncEngine'
import { Button, EmptyState, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { spacing, type Palette } from '../../shared/ui/theme'
import { MobileEventCard } from '../events/MobileEventCard'
import { useEventsScope } from '../navigation/EventsScope'
import { performAttentionAction } from './actions'
import { selectAttention, segments, segmentLabels, type AttentionItem } from './selectors'
import { TaskCard } from './TaskCard'

const emptyText = { overdue: 'Просроченных задач нет', today: 'На сегодня задач нет', tomorrow: 'На завтра задач нет' }

export default function AttentionScreen() {
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const { selectScope } = useEventsScope()
  const queryClient = useQueryClient()
  const events = useCachedEntities<Event>('events')
  const transactions = useCachedEntities<Transaction>('transactions')
  const clients = useCachedEntities<Client>('clients')
  const clientsById = useMemo(() => new Map((clients.data || []).map((client) => [client._id, client])), [clients.data])
  const services = useCachedEntities<Service>('services')
  const sync = useSyncRunState()
  const syncPresentation = getSyncStatePresentation(sync)
  const queue = useQuery({ queryKey: ['attention-sync-summary'], queryFn: async () => {
    const [counts, outbox] = await Promise.all([getSyncQueueCounts(), getOutboxSummary()])
    return { ...counts, outbox }
  } })
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const actionLock = useRef(false)
  const [actionError, setActionError] = useState('')
  const scroll = useRef<ScrollView>(null)
  const positions = useRef<Record<string, number>>({})
  useFocusEffect(useCallback(() => {
    setNow(new Date())
    void queryClient.invalidateQueries({ queryKey: ['cached-entities'] })
    void queryClient.invalidateQueries({ queryKey: ['attention-sync-summary'] })
  }, [queryClient]))
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') setNow(new Date()) })
    return () => { clearInterval(timer); listener.remove() }
  }, [])
  useEffect(() => { void queryClient.invalidateQueries({ queryKey: ['attention-sync-summary'] }) }, [sync, queryClient])
  const data = selectAttention(events.data || [], transactions.data || [], clients.data || [], now)
  const queries = [events, transactions, clients, services]
  const loading = queries.some((query) => query.isPending)
  const readError = queries.some((query) => query.isError)
  const retryRead = () => { void Promise.all(queries.map((query) => query.refetch())) }
  const runAction = async (item: AttentionItem, change: TaskChange) => {
    if (actionLock.current) return false
    actionLock.current = true
    setBusy(true)
    setActionError('')
    try {
      await performAttentionAction(item, change)
      await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'events'] })
      setNow(new Date())
      return true
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось сохранить задачу. Повторите действие.')
      return false
    } finally {
      actionLock.current = false
      setBusy(false)
    }
  }
  const retrySync = async () => {
    setBusy(true)
    setActionError('')
    try { await runSync(); await queryClient.invalidateQueries({ queryKey: ['cached-entities'] }) }
    catch { setActionError('Не удалось выполнить синхронизацию. Изменения остаются на телефоне.') }
    finally { setBusy(false); void queue.refetch() }
  }
  const section = (id: string, content: ReactNode) => <View key={id} testID={`attention-section-${id}`}
    style={styles.section} onLayout={(event) => { positions.current[id] = event.nativeEvent.layout.y }}>{content}</View>
  const summary = [
    ...segments.map((id) => ({ id, title: segmentLabels[id], count: data.pending[id] })),
    { id: 'closing', title: 'Не закрыто', count: data.pastUnclosed.length },
    { id: 'dates', title: 'Даты клиентов', count: data.clientDates.length },
  ].filter((item) => item.count > 0)
  const hasQueue = Boolean(queue.data && queue.data.pendingCount + queue.data.issueCount > 0)
  return <Screen scroll={false} contentStyle={styles.screen}>
    <ScrollView ref={scroll} testID="attention-scroll" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <PageHeader title="Важное" subtitle="Задачи, оплаты и ближайшие даты" />
      {actionError ? <Notice tone="danger" message={actionError} /> : null}
      {readError ? <Surface><Notice tone="danger" message="Не удалось прочитать локальные данные обзора" /><Button title="Повторить чтение" onPress={retryRead} /></Surface>
        : loading ? <ActivityIndicator accessibilityLabel="Загрузка обзора" /> : <>
          {!events.data?.length ? <EmptyState title="Здесь пока нет работ" description="Создайте первую заявку — она сохранится и без сети."
            action={{ title: 'Новая заявка', onPress: () => router.push('/events/edit/new' as never) }} /> : null}
          {summary.length ? <ScrollView horizontal testID="attention-summary" contentContainerStyle={styles.summary}>
            {summary.map((item) => <Button key={item.id} testID={`attention-summary-${item.id}`} title={`${item.title} · ${item.count}`} variant="secondary"
              onPress={() => scroll.current?.scrollTo({ y: positions.current[item.id] ?? 0, animated: true })} />)}
          </ScrollView> : null}
          {data.pastUnclosed.length ? section('closing', <Surface>
            <SectionTitle>Закрытие {terms.pluralGenitive}</SectionTitle>
            <Text style={styles.text}>Не закрыто: {data.pastUnclosed.length}. Проверьте итоги прошедших работ.</Text>
            <Button title="Открыть незакрытые" onPress={() => { selectScope('past', true); router.push('/(tabs)/events') }} />
          </Surface>) : null}
          {segments.map((segment) => section(segment, <>
            <SectionTitle>{segmentLabels[segment]} · {data.pending[segment]}</SectionTitle>
            <OverviewList id={segment} items={data.groups[segment]} empty={emptyText[segment]}
              render={(item) => <TaskCard key={item.key} item={item} segment={segment} busy={busy} onAction={runAction} />} />
          </>))}
          {section('upcoming', <>
            <SectionTitle>{terms.pluralCapitalized} на 3 дня</SectionTitle>
            <OverviewList id="upcoming" items={data.upcoming} empty={`На ближайшие 3 дня ${terms.pluralGenitive} нет`}
              render={(event) => <MobileEventCard key={event._id} event={event} testID={`attention-event-${event._id}`}
                client={clients.data?.find((client) => client._id === event.clientId)} clientsById={clientsById}
                services={(services.data || []).filter((service) => event.servicesIds?.includes(service._id))}
                transactions={(transactions.data || []).filter((transaction) => transaction.eventId === event._id)}
                onPress={() => router.push(`/events/${event._id}` as never)} />} />
          </>)}
          {data.clientDates.length ? section('dates', <>
            <SectionTitle>Значимые даты клиентов</SectionTitle>
            <OverviewList id="dates" items={data.clientDates} empty="Значимых дат нет" render={(item) => <Surface key={item.key}>
              <SectionTitle>{item.title}</SectionTitle>
              <Text style={styles.text}>{[item.client.firstName, item.client.secondName, item.client.thirdName].filter(Boolean).join(' ') || 'Клиент'}</Text>
              {item.comment ? <Text style={styles.text}>{item.comment}</Text> : null}
              <Text style={styles.muted}>{item.nextDate.toLocaleDateString('ru-RU')} · {item.daysLeft === 0 ? 'Сегодня' : item.daysLeft === 1 ? 'Завтра' : `Через ${item.daysLeft} дн.`}</Text>
              <Button title="Открыть клиента" variant="secondary" onPress={() => router.push(`/clients/${item.client._id}` as never)} />
            </Surface>} />
          </>) : null}
        </>}
      {queue.isError ? <Surface><Notice tone="danger" message="Не удалось прочитать очередь синхронизации" /><Button title="Повторить чтение очереди" onPress={() => void queue.refetch()} /></Surface> : null}
      {hasQueue || (sync && !['never', 'success'].includes(sync.status)) ? section('sync', <Surface testID="dashboard-sync-state">
        <SectionTitle>{syncPresentation.title}</SectionTitle>
        <Text style={styles.text}>{syncPresentation.description}</Text>
        {queue.data ? <Text style={styles.muted}>Ожидает: {queue.data.pendingCount} · Ошибки и конфликты: {queue.data.issueCount}{'\n'}Ошибки операций: {queue.data.outbox.failed || 0} · Конфликты: {queue.data.outbox.conflict || 0}</Text> : null}
        <Button title="Повторить синхронизацию" loading={busy || sync?.status === 'syncing'} onPress={() => void retrySync()} />
        <Button title="Открыть состояние синхронизации" variant="secondary" onPress={() => router.push('/sync')} />
      </Surface>) : null}
    </ScrollView>
  </Screen>
}

function OverviewList<T>({ id, items, empty, render }: { id: string; items: T[]; empty: string; render: (item: T) => ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const styles = useThemeStyles(createStyles)
  if (!items.length) return <Text style={styles.muted}>{empty}</Text>
  return <>{(expanded ? items : items.slice(0, 12)).map(render)}
    {!expanded && items.length > 12 ? <Button testID={`attention-show-all-${id}`} title={`Показать все (${items.length})`} variant="secondary" onPress={() => setExpanded(true)} /> : null}</>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { padding: 0, paddingBottom: 0 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  section: { gap: spacing.sm },
  summary: { gap: spacing.sm },
  text: { color: palette.text, fontSize: 14 },
  muted: { color: palette.cardMuted, fontSize: 13 },
})
