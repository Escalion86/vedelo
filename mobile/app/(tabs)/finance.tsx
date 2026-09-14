import { useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import {
  buildEventPaymentControl,
  categoryLabel,
  summarizeTransactions,
} from '../../src/shared/domain/finance'
import type { Client, Event, Transaction } from '../../src/shared/domain/types'
import { formatPhoneForDisplay } from '../../src/shared/format/phone'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import { EmptyState, PageHeader, Screen, SectionTitle, Surface } from '../../src/shared/ui/components'
import { colors, radius, spacing } from '../../src/shared/ui/theme'
import { useWorkItemTerminology } from '../../src/shared/hooks/useWorkItemTerminology'

type Filter = 'all' | 'income' | 'expense' | 'obligation'
const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`
const paymentMethodLabel: Record<string, string> = {
  transfer: 'Перевод', account: 'Расчётный счёт', cash: 'Наличные',
  barter: 'Бартер', obligation: 'Обязательство',
}
const personName = (client?: Client) => client
  ? [client.firstName, client.secondName].filter(Boolean).join(' ') || formatPhoneForDisplay(client.phone) || 'Клиент'
  : ''

export default function FinanceScreen() {
  const terms = useWorkItemTerminology()
  const [filter, setFilter] = useState<Filter>('all')
  const query = useCachedEntities<Transaction>('transactions')
  const eventsQuery = useCachedEntities<Event>('events')
  const clientsQuery = useCachedEntities<Client>('clients')
  const allTransactions = query.data || []
  const events = eventsQuery.data || []
  const clients = clientsQuery.data || []

  const transactions = useMemo(() => allTransactions
    .filter((item) => filter === 'all' || (filter === 'obligation' ? item.paymentMethod === 'obligation' : item.type === filter && item.paymentMethod !== 'obligation'))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()), [allTransactions, filter])
  const summary = useMemo(() => summarizeTransactions(allTransactions), [allTransactions])
  const paymentControl = useMemo(() => buildEventPaymentControl(events, allTransactions), [allTransactions, events])
  const deposits = paymentControl.filter((row) => row.depositPending)
  const balances = paymentControl.filter((row) => row.contractRemaining > 0)
  const unknownDepositCount = deposits.filter((row) => !row.event.depositExpectedAmount).length
  const knownDepositAmount = deposits.reduce((sum, row) => sum + row.depositRemaining, 0)
  const depositSummary = [knownDepositAmount ? money(knownDepositAmount) : '', unknownDepositCount ? `${unknownDepositCount} без суммы` : ''].filter(Boolean).join(' · ')
  const eventMap = useMemo(() => new Map(events.map((event) => [event._id, event])), [events])
  const clientMap = useMemo(() => new Map(clients.map((client) => [client._id, client])), [clients])

  const refresh = async () => {
    await query.refresh()
    await Promise.all([eventsQuery.refetch(), clientsQuery.refetch()])
  }

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.summary}>
        <Summary label="Фактические доходы" value={summary.income} tone="success" />
        <Summary label="Фактические расходы" value={summary.expense} tone="danger" />
        <Summary label="Результат" value={summary.income - summary.expense} tone="neutral" />
        <Summary label="Обязательства" value={summary.obligation} tone="warning" />
      </View>

      {deposits.length ? (
        <Surface>
          <View style={styles.sectionHeader}><View style={styles.sectionTitleRow}><MaterialCommunityIcons name="clock-alert-outline" size={22} color={colors.warning} /><SectionTitle>Контроль задатков</SectionTitle></View><Text style={styles.sectionAmount}>{depositSummary}</Text></View>
          {deposits.map((row) => <PaymentRow key={row.event._id} row={row} kind="deposit" fallbackTitle={terms.labelCapitalized} />)}
        </Surface>
      ) : null}

      {balances.length ? (
        <Surface>
          <View style={styles.sectionHeader}><View style={styles.sectionTitleRow}><MaterialCommunityIcons name="cash-clock" size={22} color={colors.blue} /><SectionTitle>Остатки по договорам</SectionTitle></View><Text style={[styles.sectionAmount, styles.blue]}>{money(balances.reduce((sum, row) => sum + row.contractRemaining, 0))}</Text></View>
          {balances.map((row) => <PaymentRow key={row.event._id} row={row} kind="contract" fallbackTitle={terms.labelCapitalized} />)}
        </Surface>
      ) : null}

      <View style={styles.filters}>{([['all', 'Все'], ['income', 'Доходы'], ['expense', 'Расходы'], ['obligation', 'Обязательства']] as const).map(([value, label]) => <Pressable accessibilityRole="button" key={value} style={[styles.filter, filter === value && styles.filterActive]} onPress={() => setFilter(value)}><Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{label}</Text></Pressable>)}</View>
    </View>
  )

  return (
    <Screen scroll={false} contentStyle={styles.screenContent}>
      <PageHeader title="Финансы" subtitle="Оплаты, расходы и обязательства" action={<Pressable testID="add-transaction" accessibilityRole="button" accessibilityLabel="Добавить транзакцию" style={styles.add} onPress={() => router.push('/finance/edit/new' as never)}><MaterialCommunityIcons name="plus" size={26} color="#fff" /></Pressable>} />
      <FlatList
        style={styles.listView}
        data={transactions}
        keyExtractor={(item) => item._id}
        refreshing={query.isFetching || eventsQuery.isFetching}
        onRefresh={refresh}
        ListHeaderComponent={header}
        contentContainerStyle={transactions.length ? styles.list : styles.emptyList}
        ListEmptyComponent={<EmptyState title="Нет транзакций" description="Добавьте доход или расход. Запись сохранится и синхронизируется при появлении сети." />}
        renderItem={({ item }) => {
          const event = item.eventId ? eventMap.get(item.eventId) : undefined
          const client = item.clientId ? clientMap.get(item.clientId) : undefined
          const relation = event?.eventType || personName(client)
          const obligation = item.paymentMethod === 'obligation'
          return (
            <Pressable style={styles.transaction} onPress={() => router.push(`/finance/edit/${item._id}` as never)}>
              <View style={[styles.transactionIcon, obligation ? styles.obligationIcon : item.type === 'income' ? styles.incomeIcon : styles.expenseIcon]}><MaterialCommunityIcons name={obligation ? 'calendar-clock' : item.type === 'income' ? 'arrow-down-left' : 'arrow-up-right'} size={21} color={obligation ? colors.warning : item.type === 'income' ? colors.success : colors.danger} /></View>
              <View style={styles.transactionInfo}><Text style={styles.transactionTitle}>{item.comment || categoryLabel(item.category)}</Text><Text style={styles.muted}>{item.date ? new Date(item.date).toLocaleDateString('ru-RU') : 'Без даты'} · {paymentMethodLabel[item.paymentMethod || 'transfer'] || item.paymentMethod}</Text>{relation ? <Text style={styles.relation} numberOfLines={1}>{relation}</Text> : null}</View>
              <Text style={[styles.amount, obligation ? styles.obligation : item.type === 'income' ? styles.income : styles.expense]}>{obligation ? '' : item.type === 'income' ? '+' : '−'}{money(Number(item.amount))}</Text>
            </Pressable>
          )
        }}
      />
    </Screen>
  )
}

const Summary = ({ label, value, tone }: { label: string; value: number; tone: 'success' | 'danger' | 'warning' | 'neutral' }) => <View style={[styles.summaryCard, tone === 'success' ? styles.summarySuccess : tone === 'danger' ? styles.summaryDanger : tone === 'warning' ? styles.summaryWarning : styles.summaryNeutral]}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{money(value)}</Text></View>

const PaymentRow = ({ row, kind, fallbackTitle }: { row: ReturnType<typeof buildEventPaymentControl>[number]; kind: 'deposit' | 'contract'; fallbackTitle: string }) => (
  <Pressable style={styles.paymentRow} onPress={() => router.push(`/events/${row.event._id}` as never)}>
    <View style={styles.transactionInfo}><Text style={styles.transactionTitle}>{row.event.eventType || fallbackTitle}</Text><Text style={styles.muted}>{row.event.eventDate ? new Date(row.event.eventDate).toLocaleDateString('ru-RU') : 'Дата не назначена'}{kind === 'deposit' && row.event.depositDueAt ? ` · срок ${new Date(row.event.depositDueAt).toLocaleDateString('ru-RU')}` : ''}</Text></View>
    <View style={styles.paymentAmounts}><Text style={kind === 'deposit' ? styles.obligation : styles.blue}>{kind === 'deposit' && !row.event.depositExpectedAmount ? 'сумма не указана' : money(kind === 'deposit' ? row.depositRemaining : row.contractRemaining)}</Text><Text style={styles.paid}>оплачено {money(kind === 'deposit' ? row.depositPaid : row.paid)}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
  </Pressable>
)

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 0 },
  add: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  headerContent: { gap: spacing.lg, marginBottom: spacing.lg },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryCard: { minWidth: '46%', flex: 1, padding: spacing.md, borderRadius: radius.lg, gap: 5 },
  summarySuccess: { backgroundColor: colors.successSoft }, summaryDanger: { backgroundColor: colors.dangerSoft }, summaryWarning: { backgroundColor: colors.warningSoft }, summaryNeutral: { backgroundColor: colors.primarySoft },
  summaryLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' }, summaryValue: { color: colors.text, fontSize: 17, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, sectionTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, sectionAmount: { color: colors.warning, fontSize: 13, fontWeight: '800' }, blue: { color: colors.blue, fontWeight: '800' },
  paymentRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, paymentAmounts: { alignItems: 'flex-end', gap: 2 }, paid: { color: colors.textMuted, fontSize: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, filter: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }, filterActive: { backgroundColor: colors.primary }, filterText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' }, filterTextActive: { color: '#fff' },
  listView: { flex: 1, minHeight: 0 },
  list: { gap: spacing.sm, paddingBottom: spacing.lg }, emptyList: { flexGrow: 1, paddingBottom: spacing.lg },
  transaction: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  transactionIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, incomeIcon: { backgroundColor: colors.successSoft }, expenseIcon: { backgroundColor: colors.dangerSoft }, obligationIcon: { backgroundColor: colors.warningSoft },
  transactionInfo: { flex: 1 }, transactionTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, muted: { color: colors.textMuted, fontSize: 12, marginTop: 3 }, relation: { color: colors.blue, fontSize: 11, marginTop: 3 },
  amount: { fontSize: 13, fontWeight: '800' }, income: { color: colors.success }, expense: { color: colors.danger }, obligation: { color: colors.warning, fontWeight: '800' },
})
