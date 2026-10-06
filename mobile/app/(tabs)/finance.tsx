import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import {
  buildEventPaymentControl,
  summarizeTransactions,
} from '../../src/shared/domain/finance'
import type { Client, Event, Transaction } from '../../src/shared/domain/types'
import { useQueryClient } from '@tanstack/react-query'
import { deleteLocalEntity } from '../../src/shared/storage/mutations'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import { Button, EmptyState, ErrorNotice, FilterControl, FilterOverlay, PageHeader, Screen, SectionTitle, Surface } from '../../src/shared/ui/components'
import { radius, spacing, type Palette } from '../../src/shared/ui/theme'
import { useTheme, useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import { MobileTransactionCard } from '../../src/features/finance/MobileTransactionCard'
import { TransactionPeriodFilter } from '../../src/features/finance/TransactionPeriodFilter'
import { initialTransactionFilters, selectTransactions, toggleRelation } from '../../src/features/finance/filters'
import { formatTransactionDateInput } from '../../src/shared/domain/finance'
import { useWorkItemTerminology } from '../../src/shared/hooks/useWorkItemTerminology'

const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`

export default function FinanceScreen() {
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState(initialTransactionFilters)
  const [typeOpen, setTypeOpen] = useState(false)
  const [relationOpen, setRelationOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [error, setError] = useState('')
  const deleting = useRef(false)
  const query = useCachedEntities<Transaction>('transactions')
  const eventsQuery = useCachedEntities<Event>('events')
  const clientsQuery = useCachedEntities<Client>('clients')
  const allTransactions = query.data || []
  const events = eventsQuery.data || []
  const clients = clientsQuery.data || []

  const transactions = useMemo(() => selectTransactions(allTransactions, filters), [allTransactions, filters])
  const activeDates = useMemo(() => new Set(selectTransactions(allTransactions, { ...filters, range: { from: '', to: '' } }).map((item) => formatTransactionDateInput(item.date)).filter(Boolean)), [allTransactions, filters])
  const reset = () => setFilters(initialTransactionFilters())
  const add = () => router.push('/finance/edit/new' as never)
  const loading = query.isPending || eventsQuery.isPending || clientsQuery.isPending
  const failed = query.isError || eventsQuery.isError || clientsQuery.isError
  const retry = () => { void query.refetch(); void eventsQuery.refetch(); void clientsQuery.refetch() }
  const remove = useCallback((transaction: Transaction) => Alert.alert('Удаление транзакции', 'Вы уверены, что хотите удалить транзакцию?', [
    { text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: async () => {
      if (deleting.current) return
      deleting.current = true; setError('')
      try { await deleteLocalEntity('transactions', transaction._id); await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'transactions'] }) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось удалить транзакцию') }
      finally { deleting.current = false }
    } },
  ]), [queryClient])
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
      <FilterControl title={summaryOpen ? 'Скрыть финансовую сводку' : 'Финансовая сводка'} expanded={summaryOpen} onPress={() => setSummaryOpen((value) => !value)} />
      {summaryOpen && !failed && !loading ? <>
      <View style={styles.summary}>
        <Summary label="Фактические доходы" value={summary.income} tone="success" />
        <Summary label="Фактические расходы" value={summary.expense} tone="danger" />
        <Summary label="Результат" value={summary.income - summary.expense} tone="neutral" />
        <Summary label="Обязательства" value={summary.obligation} tone="warning" />
      </View>

      {deposits.length ? (
        <Surface>
          <View style={styles.sectionHeader}><View style={styles.sectionTitleRow}><MaterialCommunityIcons name="clock-alert-outline" size={22} color={palette.notice.warning.text} /><SectionTitle>Контроль задатков</SectionTitle></View><Text style={styles.sectionAmount}>{depositSummary}</Text></View>
          {deposits.map((row) => <PaymentRow key={row.event._id} row={row} kind="deposit" fallbackTitle={terms.labelCapitalized} />)}
        </Surface>
      ) : null}

      {balances.length ? (
        <Surface>
          <View style={styles.sectionHeader}><View style={styles.sectionTitleRow}><MaterialCommunityIcons name="cash-clock" size={22} color={palette.notice.info.text} /><SectionTitle>Остатки по договорам</SectionTitle></View><Text style={[styles.sectionAmount, styles.blue]}>{money(balances.reduce((sum, row) => sum + row.contractRemaining, 0))}</Text></View>
          {balances.map((row) => <PaymentRow key={row.event._id} row={row} kind="contract" fallbackTitle={terms.labelCapitalized} />)}
        </Surface>
      ) : null}

      </> : null}
    </View>
  )

  return (
    <Screen scroll={false} contentStyle={styles.screenContent}>
      <PageHeader title="Транзакции" count={failed || loading ? undefined : transactions.length} />
      <View style={styles.toolbar}>
        <FilterOverlay testID="transaction-type" maxWidth={260} title={filters.type === 'all' ? 'Все' : filters.type === 'income' ? 'Доходы' : filters.type === 'expense' ? 'Расходы' : 'Обязательства'} visible={typeOpen} onOpen={() => { setRelationOpen(false); setTypeOpen(true) }} onClose={() => setTypeOpen(false)} selected={filters.type !== 'all'}
          options={([['all', 'Все транзакции'], ['income', 'Доходы'], ['expense', 'Расходы'], ['obligation', 'Обязательства']] as const).map(([value, label]) => ({ value, label, selected: filters.type === value }))}
          onSelect={(value) => { setFilters((current) => ({ ...current, type: value as typeof current.type })); setTypeOpen(false) }} />
        <TransactionPeriodFilter range={filters.range} activeDates={activeDates} onChange={(range) => setFilters((current) => ({ ...current, range }))} />
        <FilterOverlay testID="transaction-relations" maxWidth={260} visible={relationOpen} onOpen={() => { setTypeOpen(false); setRelationOpen(true) }} onClose={() => setRelationOpen(false)} selected={!filters.linked || !filters.unlinked}
          options={[{ value: 'linked', label: 'Связанные', selected: filters.linked }, { value: 'unlinked', label: 'Без связи', selected: filters.unlinked }, { value: 'reset', label: 'Сбросить фильтры' }]}
          onSelect={(value) => value === 'reset' ? reset() : setFilters((current) => toggleRelation(current, value as 'linked' | 'unlinked'))} />
        <Pressable testID="add-transaction" accessibilityRole="button" accessibilityLabel="Добавить транзакцию" style={styles.add} onPress={add}><MaterialCommunityIcons name="plus" size={20} color={palette.secondaryText} /></Pressable>
      </View>
      {error ? <ErrorNotice message={error} /> : null}
      {failed ? <><ErrorNotice message="Не удалось прочитать транзакции или связанные данные" /><Button title="Повторить чтение" variant="secondary" onPress={retry} /></> : null}
      {loading ? <ActivityIndicator accessibilityLabel="Загрузка транзакций" color={palette.primary} /> : null}
      <FlatList
        style={styles.listView}
        testID="transactions-list"
        data={failed || loading ? [] : transactions}
        keyExtractor={(item) => item._id}
        refreshing={query.isFetching || eventsQuery.isFetching}
        onRefresh={refresh}
        ListHeaderComponent={header}
        contentContainerStyle={transactions.length ? styles.list : styles.emptyList}
        ListEmptyComponent={!failed && !loading ? <EmptyState title={allTransactions.length ? 'По выбранным фильтрам транзакций нет' : 'Пока нет ни одной транзакции'} description={allTransactions.length ? 'Попробуйте изменить период или сбросить фильтры.' : 'Фиксируйте задатки, оплаты и расходы.'} action={{ title: allTransactions.length ? 'Сбросить фильтры' : 'Добавить транзакцию', onPress: allTransactions.length ? reset : add }} /> : null}
        renderItem={({ item }) => <MobileTransactionCard transaction={item} event={item.eventId ? eventMap.get(item.eventId) : undefined} client={item.clientId ? clientMap.get(item.clientId) : undefined} onDelete={remove} />}
      />
    </Screen>
  )
}

const Summary = ({ label, value, tone }: { label: string; value: number; tone: 'success' | 'danger' | 'warning' | 'neutral' }) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const role = palette.notice[tone]
  return <View style={[styles.summaryCard, tone === 'success' ? styles.summarySuccess : tone === 'danger' ? styles.summaryDanger : tone === 'warning' ? styles.summaryWarning : styles.summaryNeutral]}><Text style={[styles.summaryLabel, { color: role.text }]}>{label}</Text><Text style={[styles.summaryValue, { color: role.text }]}>{money(value)}</Text></View>
}

const PaymentRow = ({ row, kind, fallbackTitle }: { row: ReturnType<typeof buildEventPaymentControl>[number]; kind: 'deposit' | 'contract'; fallbackTitle: string }) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  return <Pressable style={styles.paymentRow} onPress={() => router.push(`/events/${row.event._id}` as never)}>
    <View style={styles.transactionInfo}><Text style={styles.transactionTitle}>{row.event.eventType || fallbackTitle}</Text><Text style={styles.muted}>{row.event.eventDate ? new Date(row.event.eventDate).toLocaleDateString('ru-RU') : 'Дата не назначена'}{kind === 'deposit' && row.event.depositDueAt ? ` · срок ${new Date(row.event.depositDueAt).toLocaleDateString('ru-RU')}` : ''}</Text></View>
    <View style={styles.paymentAmounts}><Text style={kind === 'deposit' ? styles.obligation : styles.blue}>{kind === 'deposit' && !row.event.depositExpectedAmount ? 'сумма не указана' : money(kind === 'deposit' ? row.depositRemaining : row.contractRemaining)}</Text><Text style={styles.paid}>оплачено {money(kind === 'deposit' ? row.depositPaid : row.paid)}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={22} color={palette.cardMuted} />
  </Pressable>
}

const createStyles = (palette: Palette) => StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  screenContent: { paddingBottom: 0 },
  add: { width: 32, height: 40, borderRadius: 6, borderWidth: 1, borderColor: palette.secondaryBorder, backgroundColor: palette.secondaryBackground, alignItems: 'center', justifyContent: 'center' },
  headerContent: { gap: spacing.lg, marginBottom: spacing.lg },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryCard: { minWidth: '46%', flex: 1, padding: spacing.md, borderRadius: radius.lg, gap: 5 },
  summarySuccess: { backgroundColor: palette.notice.success.background }, summaryDanger: { backgroundColor: palette.notice.danger.background }, summaryWarning: { backgroundColor: palette.notice.warning.background }, summaryNeutral: { backgroundColor: palette.rowSelected },
  summaryLabel: { color: palette.cardMeta, fontSize: 11, fontWeight: '700' }, summaryValue: { color: palette.text, fontSize: 17, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, sectionTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, sectionAmount: { color: palette.notice.warning.text, fontSize: 13, fontWeight: '800' }, blue: { color: palette.notice.info.text, fontWeight: '800' },
  paymentRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border }, paymentAmounts: { alignItems: 'flex-end', gap: 2 }, paid: { color: palette.cardMuted, fontSize: 10 },
  listView: { flex: 1, minHeight: 0 },
  list: { gap: spacing.sm, paddingBottom: spacing.lg }, emptyList: { flexGrow: 1, paddingBottom: spacing.lg },
  transactionInfo: { flex: 1 }, transactionTitle: { color: palette.text, fontSize: 14, fontWeight: '700' }, muted: { color: palette.cardMuted, fontSize: 12, marginTop: 3 }, relation: { color: palette.notice.info.text, fontSize: 11, marginTop: 3 },
  amount: { fontSize: 13, fontWeight: '800' }, income: { color: palette.notice.success.text }, expense: { color: palette.notice.danger.text }, obligation: { color: palette.notice.warning.text, fontWeight: '800' },
})
