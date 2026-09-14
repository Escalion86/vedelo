import { useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { Client, Event, Service, Transaction } from '../../src/shared/domain/types'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import { EmptyState, ErrorNotice, PageHeader, Screen } from '../../src/shared/ui/components'
import { colors, radius, spacing } from '../../src/shared/ui/theme'
import { EventCalendar } from '../../src/features/events/EventCalendar'
import { MobileEventCard } from '../../src/features/events/MobileEventCard'
import { buildEventCalendarOccurrences, countOccurrencesByDate, startOfMonth, toDateKey, type EventCalendarOccurrence } from '../../src/features/events/calendar'
import { useWorkItemTerminology } from '../../src/shared/hooks/useWorkItemTerminology'

type Filter = 'requests' | 'upcoming' | 'past' | 'all'
type ViewMode = 'list' | 'calendar'
type EventRow = { key: string; event: Event; occurrence?: EventCalendarOccurrence }
const filters: Array<[Filter, string]> = [['requests', 'Заявки'], ['upcoming', 'Предстоящие'], ['past', 'Прошедшие'], ['all', 'Все']]
export default function EventsScreen() {
  const terminology = useWorkItemTerminology()
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()) as string)
  const query = useCachedEntities<Event>('events')
  const clientsQuery = useCachedEntities<Client>('clients')
  const servicesQuery = useCachedEntities<Service>('services')
  const transactionsQuery = useCachedEntities<Transaction>('transactions')
  const events = useMemo(() => {
    const now = Date.now()
    return (query.data || []).filter((event) => {
      const date = event.eventDate ? new Date(event.eventDate).getTime() : 0
      if (filter === 'requests') return event.status === 'draft'
      if (filter === 'upcoming') return event.status === 'active' && (!date || date >= now)
      if (filter === 'past') return event.status === 'closed' || (date > 0 && date < now)
      return true
    }).sort((a, b) => new Date(a.eventDate || 0).getTime() - new Date(b.eventDate || 0).getTime())
  }, [filter, query.data])
  const occurrences = useMemo(() => buildEventCalendarOccurrences(events), [events])
  const clientsById = useMemo(
    () => new Map((clientsQuery.data || []).map((client) => [client._id, client])),
    [clientsQuery.data]
  )
  const servicesById = useMemo(
    () => new Map((servicesQuery.data || []).map((service) => [service._id, service])),
    [servicesQuery.data]
  )
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
  const occurrenceCounts = useMemo(() => countOccurrencesByDate(occurrences), [occurrences])
  const rows = useMemo<EventRow[]>(() => {
    if (viewMode === 'list') return events.map((event) => ({ key: `event:${event._id}`, event }))
    return occurrences
      .filter((occurrence) => occurrence.dateKey === selectedDateKey)
      .sort((a, b) => new Date(a.event.eventDate || 0).getTime() - new Date(b.event.eventDate || 0).getTime())
      .map((occurrence) => ({ key: occurrence.key, event: occurrence.event, occurrence }))
  }, [events, occurrences, selectedDateKey, viewMode])
  const selectedDate = useMemo(() => {
    const [year, monthValue, day] = selectedDateKey.split('-').map(Number)
    return new Date(year, monthValue - 1, day)
  }, [selectedDateKey])
  const selectDate = (date: Date) => setSelectedDateKey(toDateKey(date) as string)
  const refresh = async () => {
    await query.refresh()
    await Promise.all([
      clientsQuery.refetch(),
      servicesQuery.refetch(),
      transactionsQuery.refetch(),
    ])
  }

  return (
    <Screen scroll={false} contentStyle={styles.screenContent}>
      <PageHeader title={terminology.pluralCapitalized} subtitle="Заявки, календарь и контроль оплат" action={<Pressable testID="add-event" accessibilityRole="button" accessibilityLabel={`Добавить ${terminology.accusative}`} style={styles.add} onPress={() => router.push('/events/edit/new' as never)}><MaterialCommunityIcons name="plus" size={26} color="#fff" /></Pressable>} />
      <ScrollView horizontal style={styles.filterScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{filters.map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} style={[styles.filter, filter === value && styles.filterActive]} onPress={() => setFilter(value)}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{label}</Text></Pressable>)}</ScrollView>
      <View style={styles.viewSwitch}>
        <Pressable testID="events-view-list" accessibilityRole="button" accessibilityState={{ selected: viewMode === 'list' }} style={[styles.viewButton, viewMode === 'list' && styles.viewButtonActive]} onPress={() => setViewMode('list')}><MaterialCommunityIcons name="format-list-bulleted" size={18} color={viewMode === 'list' ? colors.primary : colors.textMuted} /><Text style={[styles.viewText, viewMode === 'list' && styles.viewTextActive]}>Список</Text></Pressable>
        <Pressable testID="events-view-calendar" accessibilityRole="button" accessibilityState={{ selected: viewMode === 'calendar' }} style={[styles.viewButton, viewMode === 'calendar' && styles.viewButtonActive]} onPress={() => setViewMode('calendar')}><MaterialCommunityIcons name="calendar-month-outline" size={18} color={viewMode === 'calendar' ? colors.primary : colors.textMuted} /><Text style={[styles.viewText, viewMode === 'calendar' && styles.viewTextActive]}>Календарь</Text></Pressable>
      </View>
      {query.error ? <ErrorNotice message="Не удалось прочитать локальный календарь" /> : null}
      <FlatList
        key={viewMode}
        style={styles.eventList}
        data={rows}
        keyExtractor={(item) => item.key}
        removeClippedSubviews={viewMode === 'list'}
        refreshing={
          query.isFetching ||
          clientsQuery.isFetching ||
          servicesQuery.isFetching ||
          transactionsQuery.isFetching
        }
        onRefresh={refresh}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={rows.length || viewMode === 'calendar' ? styles.list : styles.emptyList}
        ListHeaderComponent={viewMode === 'calendar' ? <View style={styles.calendarHeader}><EventCalendar month={month} selectedDateKey={selectedDateKey} counts={occurrenceCounts} undatedCount={events.filter((event) => !event.eventDate).length} onMonthChange={setMonth} onSelectDate={selectDate} /><Text style={styles.selectedDate}>{selectedDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</Text></View> : null}
        ListEmptyComponent={<EmptyState title={viewMode === 'calendar' ? 'На эту дату записей нет' : 'Здесь пока пусто'} description={viewMode === 'calendar' ? `Выберите другой день или создайте ${terminology.accusative}.` : 'Создайте новую заявку — изменения сохранятся даже без сети.'} />}
        renderItem={({ item }) => {
          const eventServices = (item.event.servicesIds || [])
            .map((serviceId) => servicesById.get(serviceId))
            .filter((service): service is Service => Boolean(service))
          return (
            <MobileEventCard
              event={item.event}
              client={item.event.clientId ? clientsById.get(item.event.clientId) : undefined}
              services={eventServices}
              transactions={transactionsByEvent.get(item.event._id) || []}
              occurrence={item.occurrence}
              testID={`event-row-${item.key}`}
              onPress={() => router.push(`/events/${item.event._id}` as never)}
            />
          )
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 0 },
  add: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  filterScroll: { flexGrow: 0, flexShrink: 0, minHeight: 42 }, filters: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: spacing.lg }, filter: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }, filterActive: { backgroundColor: colors.primary },
  filterText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' }, filterTextActive: { color: '#fff' },
  viewSwitch: { flexDirection: 'row', flexShrink: 0, alignSelf: 'flex-start', padding: 3, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  viewButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  viewButtonActive: { backgroundColor: colors.surface }, viewText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' }, viewTextActive: { color: colors.primary },
  eventList: { flex: 1, minHeight: 0 },
  list: { flexGrow: 1, gap: spacing.sm, paddingBottom: spacing.xl }, emptyList: { flexGrow: 1, justifyContent: 'center' },
  calendarHeader: { gap: spacing.md, marginBottom: spacing.sm }, selectedDate: { color: colors.text, fontSize: 16, fontWeight: '700', textTransform: 'capitalize' },
})
