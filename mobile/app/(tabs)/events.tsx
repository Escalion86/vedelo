import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { Client, Service, Transaction } from '../../src/shared/domain/types'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import { Button, EmptyState, ErrorNotice, PageHeader, Screen } from '../../src/shared/ui/components'
import { useTheme, useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import { type Palette } from '../../src/shared/ui/theme'
import { EventCalendar } from '../../src/features/events/EventCalendar'
import { MobileEventCard } from '../../src/features/events/MobileEventCard'
import { EventFilters } from '../../src/features/events/EventFilters'
import { applyPastPreset, defaultEventFilters, eventInScope, selectEvents,
  type EventFiltersState, type EventsListScope, type ListEvent } from '../../src/features/events/filters'
import { buildEventCalendarOccurrences, countOccurrencesByDate, startOfMonth, toDateKey, type EventCalendarOccurrence } from '../../src/features/events/calendar'
import { useWorkItemTerminology } from '../../src/shared/hooks/useWorkItemTerminology'
import { useEventsScope } from '../../src/features/navigation/EventsScope'

type ViewMode = 'list' | 'calendar'
type EventRow = { key: string; event: ListEvent; occurrence?: EventCalendarOccurrence }
export default function EventsScreen() {
  const terminology = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const { filter, selection, unclosedOnly } = useEventsScope()
  const scope: EventsListScope = filter === 'past' ? 'past' : 'upcoming'
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [filters, setFilters] = useState<Record<EventsListScope, EventFiltersState>>(() => ({
    upcoming: defaultEventFilters('upcoming'), past: defaultEventFilters('past'),
  }))
  useEffect(() => {
    if (selection > 0) {
      setViewMode('list')
      setFilters((current) => {
        // The Important shortcut must show the complete count, even after a city filter.
        if (unclosedOnly) return { ...current, past: applyPastPreset(defaultEventFilters('past'), 'unclosed') }
        return current.past.preset === 'unclosed'
          ? { ...current, past: applyPastPreset(current.past, '') } : current
      })
    }
  }, [selection, unclosedOnly])
  const [now, setNow] = useState(() => new Date())
  useFocusEffect(useCallback(() => {
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, []))
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()) as string)
  const query = useCachedEntities<ListEvent>('events')
  const clientsQuery = useCachedEntities<Client>('clients')
  const servicesQuery = useCachedEntities<Service>('services')
  const transactionsQuery = useCachedEntities<Transaction>('transactions')
  const currentFilters = filters[scope]
  const events = useMemo(() => selectEvents(query.data || [], scope, currentFilters, now), [query.data, scope, currentFilters, now])
  const scopeEvents = useMemo(() => (query.data || []).filter((event) => eventInScope(event, scope, now)), [query.data, scope, now])
  const towns = useMemo(() => Array.from(new Set(scopeEvents.map((event) => event.address?.town?.trim()).filter((town): town is string => Boolean(town))))
    .sort((a, b) => a.localeCompare(b, 'ru')), [scopeEvents])
  const clientsById = useMemo(() => new Map((clientsQuery.data || []).map((client) => [client._id, client])), [clientsQuery.data])
  const servicesById = useMemo(() => new Map((servicesQuery.data || []).map((service) => [service._id, service])), [servicesQuery.data])
  const transactionsByEvent = useMemo(() => {
    const grouped = new Map<string, Transaction[]>()
    ;(transactionsQuery.data || []).forEach((transaction) => {
      if (!transaction.eventId) return
      const items = grouped.get(transaction.eventId) || []
      items.push(transaction)
      grouped.set(transaction.eventId, items)
    })
    return grouped
  }, [transactionsQuery.data])
  const occurrences = useMemo(() => buildEventCalendarOccurrences(events), [events])
  const occurrenceCounts = useMemo(() => countOccurrencesByDate(occurrences), [occurrences])
  const listRows = useMemo<EventRow[]>(() => events.map((event) => ({ key: `event:${event._id}`, event })), [events])
  const calendarRows = useMemo<EventRow[]>(() => occurrences.filter((item) => item.dateKey === selectedDateKey)
    .map((occurrence) => ({ key: occurrence.key, event: occurrence.event, occurrence })), [occurrences, selectedDateKey])
  const selectedDate = useMemo(() => {
    const [year, monthValue, day] = selectedDateKey.split('-').map(Number)
    return new Date(year, monthValue - 1, day)
  }, [selectedDateKey])
  const reset = () => setFilters((current) => ({ ...current, [scope]: defaultEventFilters(scope) }))
  const relatedError = clientsQuery.isError || servicesQuery.isError || transactionsQuery.isError
  const retryRelated = () => void Promise.all([clientsQuery.refetch(), servicesQuery.refetch(), transactionsQuery.refetch()])
  const refresh = async () => {
    await query.refresh()
    await Promise.all([clientsQuery.refetch(), servicesQuery.refetch(), transactionsQuery.refetch()])
  }
  const empty = (calendar: boolean) => {
    if (query.isError) return null
    if (query.isPending) return <ActivityIndicator accessibilityLabel="Загрузка работ" color={palette.primary} />
    if (!events.length && currentFilters.preset === 'unclosed') return <EmptyState title="Незакрытых работ не найдено"
      description="Сбросьте фильтр, чтобы увидеть остальные прошедшие записи." action={{ title: 'Сбросить фильтр', onPress: reset }} />
    if (scopeEvents.length && !events.length) return <EmptyState title="Ничего не найдено"
      description="Измените фильтры, чтобы увидеть остальные записи." action={{ title: 'Сбросить фильтры', onPress: reset }} />
    if (calendar && events.length) return <EmptyState title="На эту дату записей нет" description="Выберите другой день или вернитесь к списку, включая записи без даты."
      action={{ title: 'Показать список', onPress: () => setViewMode('list') }} />
    return <EmptyState title={scope === 'past' ? 'Прошедших пока нет' : 'Здесь пока пусто'}
      description={scope === 'past' ? 'Здесь появятся записи после даты окончания.' : 'Создайте заявку — изменения сохранятся даже без сети.'}
      action={scope === 'past' ? undefined : { title: 'Создать заявку', onPress: () => router.push('/events/edit/new' as never) }} />
  }
  const renderRow = ({ item }: { item: EventRow }) => <MobileEventCard event={item.event}
    client={item.event.clientId ? clientsById.get(item.event.clientId) : undefined} clientsById={clientsById}
    services={(item.event.servicesIds || []).map((id) => servicesById.get(id)).filter((service): service is Service => Boolean(service))}
    transactions={transactionsByEvent.get(item.event._id) || []} occurrence={item.occurrence}
    loading={clientsQuery.isPending || servicesQuery.isPending || transactionsQuery.isPending}
    testID={`event-row-${item.key}`} onPress={() => router.push(`/events/${item.event._id}` as never)} />
  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.heading}><PageHeader title={terminology.pluralCapitalized} count={events.length}
        subtitle={scope === 'past' ? 'Прошедшие' : 'Предстоящие'} /></View>
      <View style={styles.toolbar}>
        <EventFilters scope={scope} value={currentFilters} towns={towns} onChange={(value) => setFilters((current) => ({ ...current, [scope]: value }))} />
        <Pressable testID={`events-view-${viewMode === 'list' ? 'calendar' : 'list'}`} accessibilityRole="button"
          accessibilityLabel={viewMode === 'list' ? 'Показать календарь' : 'Показать список'}
          style={({ pressed }) => [styles.viewButton, pressed && styles.pressed]} onPress={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}>
          <MaterialCommunityIcons name={viewMode === 'list' ? 'calendar-month-outline' : 'format-list-bulleted'} size={22} color={palette.text} />
        </Pressable>
      </View>
      {query.isError ? <View style={styles.heading}><ErrorNotice message="Не удалось прочитать список работ" /><Button title="Повторить чтение" onPress={() => void query.refetch()} /></View> : null}
      {relatedError ? <View style={styles.heading}><ErrorNotice message="Часть сведений о клиентах, услугах или оплатах недоступна" /><Button title="Повторить загрузку сведений" onPress={retryRelated} /></View> : null}
      <View style={styles.lists}>
        {(['list', 'calendar'] as const).map((mode) => <View key={mode} testID={`events-${mode}-pane`}
          pointerEvents={viewMode === mode ? 'auto' : 'none'} accessibilityElementsHidden={viewMode !== mode}
          importantForAccessibility={viewMode === mode ? 'auto' : 'no-hide-descendants'}
          style={[StyleSheet.absoluteFill, viewMode !== mode && styles.hidden]}>
          <FlatList testID={`events-${mode}-rows`} data={mode === 'list' ? listRows : calendarRows}
            keyExtractor={(item) => item.key} renderItem={renderRow} removeClippedSubviews={false}
            refreshing={query.isFetching} onRefresh={refresh} showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            ListHeaderComponent={mode === 'calendar' ? <View style={styles.calendarHeader}>
              <EventCalendar month={month} selectedDateKey={selectedDateKey} counts={occurrenceCounts}
                undatedCount={events.filter((event) => !event.eventDate).length} onMonthChange={setMonth}
                onSelectDate={(date) => setSelectedDateKey(toDateKey(date) as string)} />
              <Text style={styles.selectedDate}>{selectedDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            </View> : null}
            ListEmptyComponent={empty(mode === 'calendar')} />
        </View>)}
      </View>
    </Screen>
  )
}
const createStyles = (palette: Palette) => StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingBottom: 0, gap: 8 },
  heading: { paddingHorizontal: 16 }, toolbar: { paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewButton: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: palette.rowPressed }, lists: { flex: 1, minHeight: 0 }, hidden: { opacity: 0, zIndex: -1 },
  list: { flexGrow: 1, paddingBottom: 24 }, calendarHeader: { paddingHorizontal: 8, gap: 12, marginBottom: 8 },
  selectedDate: { color: palette.text, fontSize: 16, fontWeight: '700', textTransform: 'capitalize' },
})
