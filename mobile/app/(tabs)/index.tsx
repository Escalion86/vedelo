import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { Event, Transaction } from '../../src/shared/domain/types'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import { getSyncStatePresentation } from '../../src/shared/domain/syncStatePresentation'
import { useSyncRunState } from '../../src/shared/hooks/useSyncRunState'
import {
  Button,
  EmptyState,
  PageHeader,
  Screen,
  SectionTitle,
  StatusChip,
  Surface,
} from '../../src/shared/ui/components'
import { colors, radius, spacing } from '../../src/shared/ui/theme'
import { useWorkItemTerminology } from '../../src/shared/hooks/useWorkItemTerminology'

const dayStart = (offset = 0) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export default function DashboardScreen() {
  const terms = useWorkItemTerminology()
  const { user } = useAuth()
  const syncRunState = useSyncRunState()
  const syncPresentation = getSyncStatePresentation(syncRunState)
  const eventsQuery = useCachedEntities<Event>('events')
  const transactionsQuery = useCachedEntities<Transaction>('transactions')
  const events = eventsQuery.data || []
  const transactions = transactionsQuery.data || []

  const data = useMemo(() => {
    const now = Date.now()
    const today = dayStart()
    const tomorrow = dayStart(1)
    const dayAfter = dayStart(2)
    const tasks = events.flatMap((event) =>
      (event.additionalEvents || [])
        .filter((task) => !task.done && task.date)
        .map((task) => ({
          event,
          task,
          date: new Date(task.date as string).getTime(),
        }))
    )
    const overdue = tasks.filter((item) => item.date < today)
    const dueToday = tasks.filter(
      (item) => item.date >= today && item.date < tomorrow
    )
    const dueTomorrow = tasks.filter(
      (item) => item.date >= tomorrow && item.date < dayAfter
    )
    const deposits = events.filter(
      (event) =>
        event.waitDeposit &&
        (!event.depositDueAt ||
          new Date(event.depositDueAt).getTime() <= dayAfter)
    )
    const upcoming = events
      .filter(
        (event) =>
          event.eventDate &&
          new Date(event.eventDate).getTime() >= now &&
          !['canceled', 'closed'].includes(event.status)
      )
      .sort(
        (a, b) =>
          new Date(a.eventDate as string).getTime() -
          new Date(b.eventDate as string).getTime()
      )
      .slice(0, 4)
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const monthBalance = transactions
      .filter(
        (item) =>
          !item.date || new Date(item.date).getTime() >= monthStart.getTime()
      )
      .reduce(
        (sum, item) =>
          sum +
          (item.type === 'income' ? Number(item.amount) : -Number(item.amount)),
        0
      )
    return { overdue, dueToday, dueTomorrow, deposits, upcoming, monthBalance }
  }, [events, transactions])

  const refresh = async () => {
    await eventsQuery.refresh()
    await transactionsQuery.refetch()
  }

  return (
    <Screen contentStyle={styles.screenContent}>
      <PageHeader
        title={`Здравствуйте${user?.firstName ? `, ${user.firstName}` : ''}`}
        subtitle="Самое важное на сегодня"
        action={
          <Pressable
            accessibilityLabel="Синхронизировать"
            onPress={refresh}
            style={styles.iconButton}
          >
            <MaterialCommunityIcons
              name="sync"
              size={22}
              color={colors.primary}
            />
          </Pressable>
        }
      />

      <View style={styles.metrics}>
        <Metric
          label="Просрочено"
          value={data.overdue.length}
          tone="danger"
          onPress={() => router.push('/(tabs)/tasks')}
        />
        <Metric
          label="Сегодня"
          value={data.dueToday.length}
          tone="warning"
          onPress={() => router.push('/(tabs)/tasks')}
        />
        <Metric
          label="Задатки"
          value={data.deposits.length}
          tone="blue"
          onPress={() => router.push('/(tabs)/events')}
        />
      </View>

      <Pressable
        testID="dashboard-sync-state"
        accessibilityRole="button"
        accessibilityLabel="Открыть состояние синхронизации"
        onPress={() => router.push('/sync')}
      >
        <Surface>
          <View style={styles.sectionHeader}>
            <View style={styles.syncText}>
              <Text style={styles.rowTitle}>{syncPresentation.title}</Text>
              <Text style={styles.rowSubtitle}>
                {syncPresentation.description}
              </Text>
            </View>
            <StatusChip
              label={syncRunState?.status === 'success' ? 'Готово' : 'Открыть'}
              tone={syncPresentation.tone}
            />
          </View>
        </Surface>
      </Pressable>

      <Surface>
        <View style={styles.sectionHeader}>
          <SectionTitle>Ближайшие {terms.plural}</SectionTitle>
          <Pressable onPress={() => router.push('/(tabs)/events')}>
            <Text style={styles.link}>Все</Text>
          </Pressable>
        </View>
        {data.upcoming.length ? (
          data.upcoming.map((event) => (
            <Pressable
              key={event._id}
              style={styles.row}
              onPress={() => router.push(`/events/${event._id}` as never)}
            >
              <View style={styles.dateBadge}>
                <Text style={styles.dateDay}>
                  {new Date(event.eventDate as string).getDate()}
                </Text>
                <Text style={styles.dateMonth}>
                  {new Date(event.eventDate as string).toLocaleDateString(
                    'ru-RU',
                    { month: 'short' }
                  )}
                </Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {event.eventType || terms.labelCapitalized}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {event.description || event.address?.town || 'Без описания'}
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color={colors.textMuted}
              />
            </Pressable>
          ))
        ) : (
          <EmptyState
            title="Календарь свободен"
            description={`Создайте заявку или ${terms.accusative} — запись появится здесь.`}
          />
        )}
        <Button
          title="Новая заявка"
          onPress={() => router.push('/events/edit/new' as never)}
        />
      </Surface>

      <Surface>
        <View style={styles.sectionHeader}>
          <SectionTitle>Финансы месяца</SectionTitle>
          <StatusChip
            label={data.monthBalance >= 0 ? 'Плюс' : 'Минус'}
            tone={data.monthBalance >= 0 ? 'success' : 'danger'}
          />
        </View>
        <Text style={styles.money}>
          {new Intl.NumberFormat('ru-RU').format(data.monthBalance)} ₽
        </Text>
        <Text style={styles.muted}>
          Баланс доходов и расходов за текущий месяц
        </Text>
      </Surface>
    </Screen>
  )
}

const Metric = ({
  label,
  value,
  tone,
  onPress,
}: {
  label: string
  value: number
  tone: 'danger' | 'warning' | 'blue'
  onPress: () => void
}) => (
  <Pressable
    onPress={onPress}
    style={[
      styles.metric,
      tone === 'danger' && styles.metricDanger,
      tone === 'warning' && styles.metricWarning,
      tone === 'blue' && styles.metricBlue,
    ]}
  >
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </Pressable>
)

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 0 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  metric: {
    flex: 1,
    minHeight: 94,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  metricDanger: { backgroundColor: colors.dangerSoft },
  metricWarning: { backgroundColor: colors.warningSoft },
  metricBlue: { backgroundColor: colors.blueSoft },
  metricValue: { color: colors.text, fontSize: 28, fontWeight: '800' },
  metricLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  syncText: { flex: 1 },
  link: { color: colors.primary, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dateBadge: {
    width: 48,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { color: colors.text, fontSize: 18, fontWeight: '800' },
  dateMonth: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  rowText: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  money: { color: colors.text, fontSize: 30, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 13 },
})
