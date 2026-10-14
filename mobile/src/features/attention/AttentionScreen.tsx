import { typography } from '../../shared/ui/theme'
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
import { EmptyState, Notice, PageHeader, Screen, Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import { spacing, type Palette, type TemporalStatus } from '../../shared/ui/theme'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import { UnreadClientReviewsSection } from '../reviews/ClientReviewsSection'
import { MobileEventCard } from '../events/MobileEventCard'
import { useEventsScope } from '../navigation/EventsScope'
import { performAttentionAction } from './actions'
import { selectAttention, segments, segmentLabels, type AttentionItem } from './selectors'
import { TaskCard } from './TaskCard'
import { AttentionSection, ClientDateRow, CompactAction, RequestCard, SummaryChip } from './AttentionPresentation'

const emptyText = { overdue: 'Просроченных задач нет', today: 'На сегодня задач нет', tomorrow: 'На завтра задач нет' }

export default function AttentionScreen() {
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
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
  const section = (id: string, title: string, count: number | undefined, content: ReactNode,
    options: { tone?: TemporalStatus; accent?: string; help?: string } = {}) =>
    <AttentionSection key={id} id={id} title={title} count={count} {...options}
      onLayout={(event) => { positions.current[id] = event.nativeEvent.layout.y }}>{content}</AttentionSection>
  const summary = [
    ...segments.map((id) => ({ id, label: { overdue: 'просроч.', today: 'сегодня', tomorrow: 'завтра' }[id], color: palette.sectionAccent[id], count: data.pending[id] })),
    { id: 'closing', label: 'не закрыто', color: palette.sectionAccent.overdue, count: data.pastUnclosed.length },
    { id: 'past-requests', label: `${requestNoun(data.pastRequests.length)} с прошедшей датой`, color: palette.primary, count: data.pastRequests.length },
    { id: 'no-next-step', label: 'без следующего шага', color: palette.primary, count: data.withoutNextStep.length },
    // Current PWA summary uses teal for client dates; no corresponding global palette role.
    { id: 'dates', label: 'даты клиентов', color: '#0d9488', count: data.clientDates.length },
  ].filter((item) => item.count > 0)
  const hasQueue = Boolean(queue.data && queue.data.pendingCount + queue.data.issueCount > 0)
  const syncSection = hasQueue || queue.isPending || queue.isError || (sync && !['never', 'success'].includes(sync.status))
    ? section('sync', 'Синхронизация', queue.data ? queue.data.pendingCount + queue.data.issueCount : undefined, <>
      {queue.isPending ? <ActivityIndicator accessibilityLabel="Загрузка очереди синхронизации" color={palette.primary} /> : null}
      {queue.isError ? <>
        <Notice tone="danger" message="Не удалось прочитать очередь синхронизации" />
        <CompactAction title="Повторить чтение очереди" onPress={() => void queue.refetch()} />
      </> : null}
      {hasQueue || (sync && !['never', 'success'].includes(sync.status)) ? <View testID="dashboard-sync-state" style={styles.syncState}>
        <Text style={styles.stateTitle}>{syncPresentation.title}</Text>
        <Text style={styles.muted}>{syncPresentation.description}</Text>
        {queue.data ? <Text style={styles.muted}>Ожидает: {queue.data.pendingCount} · Ошибки и конфликты: {queue.data.issueCount}{'\n'}Ошибки операций: {queue.data.outbox.failed || 0} · Конфликты: {queue.data.outbox.conflict || 0}</Text> : null}
        <View style={styles.actions}>
          <CompactAction title="Повторить синхронизацию" loading={busy || sync?.status === 'syncing'} onPress={() => void retrySync()} />
          <CompactAction title="Открыть состояние синхронизации" variant="ghost" onPress={() => router.push('/sync' as never)} />
        </View>
      </View> : null}
    </>, { tone: queue.data?.issueCount ? 'overdue' : 'neutral' }) : null
  return <Screen scroll={false} contentStyle={styles.screen}>
    <ScrollView ref={scroll} testID="attention-scroll" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <PageHeader title="Важное" />
      {actionError ? <Notice tone="danger" message={actionError} /> : null}
      {readError ? <Surface><Notice tone="danger" message="Не удалось прочитать локальные данные обзора" /><CompactAction title="Повторить чтение" onPress={retryRead} /></Surface>
        : loading ? <ActivityIndicator accessibilityLabel="Загрузка обзора" color={palette.primary} /> : <>
          {!events.data?.length ? <EmptyState title="Здесь пока нет работ" description="Создайте первую заявку — она сохранится и без сети."
            action={{ title: 'Новая заявка', onPress: () => router.push('/events/edit/new' as never) }} /> : null}
          {summary.length ? <ScrollView horizontal testID="attention-summary" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summary} style={styles.summaryScroll}>
            {summary.map((item) => <SummaryChip key={item.id} id={item.id} label={`${item.count} ${item.label}`} color={item.color}
              onPress={() => scroll.current?.scrollTo({ y: positions.current[item.id] ?? 0, animated: true })} />)}
          </ScrollView> : null}
          {data.pastRequests.length ? section('past-requests', 'Заявки с прошедшей датой', data.pastRequests.length, <>
            <Text style={styles.muted}>Дата прошла — уточните результат. Проверьте оплаты и закройте заявку, отмените её или перенесите дату.</Text>
            <OverviewList id="past-requests" items={data.pastRequests} empty="" initialCount={5} step={10}
              render={(event) => <RequestCard key={event._id} event={event} client={clientsById.get(event.clientId || '')} past />} />
          </>, { help: getFieldHelp('attention.pastRequests'), tone: 'today' }) : null}
          {data.pastUnclosed.length ? section('closing', `Закрытие ${terms.pluralGenitive}`, data.pastUnclosed.length, <>
            <Text style={styles.muted}>Не закрыто: {data.pastUnclosed.length}. Проверьте итоги прошедших работ.</Text>
            <CompactAction title="Открыть незакрытые" onPress={() => { selectScope('past', true); router.push('/(tabs)/events') }} />
          </>, { tone: 'overdue' }) : null}
          {segments.map((segment) => section(segment, segmentLabels[segment], data.pending[segment],
            <OverviewList id={segment} items={data.groups[segment]} empty={emptyText[segment]}
              render={(item) => <TaskCard key={item.key} item={item} segment={segment} busy={busy} onAction={runAction} />} />,
            { tone: segment, accent: palette.sectionAccent[segment] }))}
          {section('no-next-step', 'Заявки без следующего шага', data.withoutNextStep.length, <>
            {data.withoutNextStep.length ? <Text style={styles.muted}>Здесь заявки без невыполненной задачи с датой. Назначьте звонок, встречу или другое действие. Просроченные задачи показаны в «Просрочено». Заявки с прошедшей датой вынесены в отдельный блок.</Text> : null}
            <OverviewList id="no-next-step" items={data.withoutNextStep} empty="Заявок без следующего шага нет" initialCount={5} step={10}
              render={(event) => <RequestCard key={event._id} event={event} client={clientsById.get(event.clientId || '')} past={false} />} />
          </>, { help: getFieldHelp('attention.withoutNextStep'), tone: 'today' })}
        </>}
      {syncSection}
      {!readError && !loading ? <>
        {section('upcoming', `${terms.pluralCapitalized} на 3 дня`, data.upcoming.length,
          <OverviewList id="upcoming" items={data.upcoming} empty={`На ближайшие 3 дня ${terms.pluralGenitive} нет`}
            render={(event) => <MobileEventCard key={event._id} event={event} testID={`attention-event-${event._id}`}
              client={clientsById.get(event.clientId || '')} clientsById={clientsById}
              services={(services.data || []).filter((service) => event.servicesIds?.includes(service._id))}
              transactions={(transactions.data || []).filter((transaction) => transaction.eventId === event._id)}
              onPress={() => router.push(`/events/${event._id}` as never)} />} />,
          { tone: 'upcoming', accent: palette.primary })}
        {data.clientDates.length ? section('dates', 'Значимые даты клиентов', data.clientDates.length,
          <OverviewList id="dates" items={data.clientDates} empty="Значимых дат нет"
            render={(item) => <ClientDateRow key={item.key} item={item} />} />, { tone: 'upcoming' }) : null}
      </> : null}
      <UnreadClientReviewsSection />
    </ScrollView>
  </Screen>
}

function requestNoun(count: number) {
  const last = count % 10, hundred = count % 100
  return hundred >= 11 && hundred <= 14 ? 'заявок' : last === 1 ? 'заявка' : last >= 2 && last <= 4 ? 'заявки' : 'заявок'
}

function OverviewList<T>({ id, items, empty, render, initialCount = 12, step }: {
  id: string; items: T[]; empty: string; render: (item: T) => ReactNode; initialCount?: number; step?: number
}) {
  const [visibleCount, setVisibleCount] = useState(initialCount)
  const styles = useThemeStyles(createStyles)
  if (!items.length) return <Text style={styles.muted}>{empty}</Text>
  return <>{items.slice(0, visibleCount).map(render)}
    {items.length > visibleCount ? <CompactAction testID={`attention-show-all-${id}`}
      title={step ? `Показать ещё (${items.length - visibleCount})` : `Показать все (${items.length})`}
      onPress={() => setVisibleCount((count) => step ? count + step : items.length)} /> : null}</>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { padding: 0, paddingBottom: 0 },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  summaryScroll: { flexGrow: 0, flexShrink: 0 }, summary: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncState: { gap: spacing.sm },
  stateTitle: { fontFamily: typography.fontFamily, color: palette.cardTitle, fontSize: 14, fontWeight: '600' },
  muted: { fontFamily: typography.fontFamily, color: palette.cardMuted, fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
})
