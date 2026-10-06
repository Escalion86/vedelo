import { useMemo, useState } from 'react'
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { Client, Event, Transaction } from '../../shared/domain/types'
import { Surface } from '../../shared/ui/components'
import { QuickActionsSheet } from '../../shared/ui/QuickContacts'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { clientName } from '../clients/clientList'
import { transactionPresentation } from './transactionCard'

export function MobileTransactionCard({ transaction, client, event, onDelete }: { transaction: Transaction; client?: Client; event?: Event; onDelete: (transaction: Transaction) => void }) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const terms = useWorkItemTerminology()
  const { width } = useWindowDimensions()
  const [actions, setActions] = useState(false)
  const row = transactionPresentation(transaction)
  const busy = transaction.syncStatus === 'syncing'
  const role = palette.notice[row.kind === 'income' ? 'success' : row.kind === 'expense' ? 'danger' : 'warning']
  const edit = () => { setActions(false); router.push(`/finance/edit/${transaction._id}` as never) }
  const gestures = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, state) => !busy && Math.abs(state.dx) > 18 && Math.abs(state.dx) > Math.abs(state.dy) * 2,
    onPanResponderRelease: (_, state) => { if (state.dx < -60) edit(); if (state.dx > 60) onDelete(transaction) },
  }), [busy, transaction, onDelete])
  const eventTitle = event ? event.eventType || [event.address?.town, event.address?.street, event.address?.house].filter(Boolean).join(', ') || terms.labelCapitalized : `Без ${terms.genitive}`
  const eventDate = event?.eventDate && Number.isFinite(Date.parse(event.eventDate)) ? new Date(event.eventDate).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
  return <View {...gestures.panHandlers}>
    <Pressable testID={`transaction-card-${transaction._id}`} accessibilityRole="button" accessibilityLabel={`${row.title}, ${row.amount}, ${row.method}`} disabled={busy} onPress={edit} style={({ pressed }) => pressed && styles.pressed}>
      <Surface testID={`transaction-shell-${transaction._id}`} style={styles.shell}>
        <View testID={`transaction-marker-${transaction._id}`} style={[styles.marker, { backgroundColor: row.kind === 'income' ? palette.transactionIncome : row.kind === 'expense' ? palette.transactionExpense : role.text }]} />
        <Pressable accessibilityRole="button" accessibilityLabel="Действия с транзакцией" accessibilityState={{ expanded: actions, disabled: busy }} disabled={busy} style={styles.menu} onPress={(e) => { e.stopPropagation(); setActions(true) }}><MaterialCommunityIcons name="dots-vertical" size={22} color={palette.cardMuted} /></Pressable>
        <View style={styles.grid}>
          <View testID={`transaction-date-${transaction._id}`} accessible accessibilityLabel={`${row.dateLabel}: ${transaction.date || 'не указана'}`} style={styles.date}>
            <View style={styles.dayRow}><Text style={styles.weekday}>{row.weekday.toUpperCase()}</Text><Text style={styles.day}>{row.day}</Text></View>
            {row.month ? <Text style={styles.month}>{row.month}</Text> : null}{row.time ? <Text style={styles.meta}>{row.time}</Text> : null}
          </View>
          <View style={styles.details}>
            <Text numberOfLines={1} style={[styles.title, { fontSize: width < 420 ? 15.2 : 16 }]}>{row.title}<Text style={styles.meta}> · {row.method}</Text></Text>
            <Text numberOfLines={1} style={styles.client}>{client ? clientName(client) : transaction.clientId ? 'Клиент недоступен' : 'Без клиента'}</Text>
            <Text numberOfLines={1} style={styles.meta}>{eventTitle}{eventDate ? ` — ${eventDate}` : ''}</Text>
            {row.comment ? <Text numberOfLines={1} style={styles.meta}>{row.comment}</Text> : null}
          </View>
          <View style={[styles.amountBox, { maxWidth: Math.max(92, Math.min(160, width * 0.32)) }]}><Text testID={`transaction-amount-${transaction._id}`} style={[styles.amount, { color: role.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{row.amount}</Text></View>
        </View>
        {transaction.syncStatus === 'pending' ? <Text style={styles.meta}>Ожидает отправки</Text> : null}
        {busy ? <ActivityIndicator accessibilityLabel="Синхронизация транзакции" color={palette.primary} /> : null}
        {transaction.syncStatus === 'failed' || transaction.syncStatus === 'conflict' ? <Pressable accessibilityRole="button" accessibilityLabel="Открыть синхронизацию" onPress={(e) => { e.stopPropagation(); router.push('/sync' as never) }}><Text style={styles.error}>{transaction.syncStatus === 'conflict' ? 'Конфликт изменений' : 'Не удалось синхронизировать'}</Text></Pressable> : null}
      </Surface>
    </Pressable>
    <QuickActionsSheet title="Действия с транзакцией" visible={actions} onClose={() => setActions(false)}>
      <Pressable accessibilityRole="button" style={styles.action} onPress={edit}><Text style={styles.client}>Редактировать</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.action} onPress={() => { setActions(false); router.push({ pathname: '/history', params: { entityType: 'transaction', entityId: transaction._id } } as never) }}><Text style={styles.client}>История действий</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.action} onPress={() => { setActions(false); onDelete(transaction) }}><Text style={styles.error}>Удалить транзакцию</Text></Pressable>
    </QuickActionsSheet>
  </View>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  shell: { padding: 12, paddingLeft: 16, gap: 4, marginBottom: 0, minHeight: 104 }, pressed: { opacity: 0.78 },
  marker: { position: 'absolute', top: 8, bottom: 8, left: 0, width: 4, borderRadius: 3 },
  menu: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  grid: { flexDirection: 'row', gap: 12, alignItems: 'stretch' }, date: { width: 76, borderRightWidth: 1, borderColor: palette.border, paddingVertical: 8, paddingRight: 8, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 }, weekday: { color: palette.cardMeta, fontSize: 12 }, day: { color: palette.cardTitle, fontSize: 24, fontWeight: '600' }, month: { color: palette.text, fontSize: 16 },
  details: { flex: 1, minWidth: 0, paddingTop: 4, gap: 4, justifyContent: 'center' }, title: { fontSize: 14, color: palette.cardTitle, fontWeight: '600' }, client: { fontSize: 14, fontWeight: '500', color: palette.cardMeta }, meta: { fontSize: 12, color: palette.cardMuted, fontWeight: '400' },
  amountBox: { minWidth: 92, flexShrink: 1, alignItems: 'flex-end', justifyContent: 'center', paddingTop: 20 }, amount: { fontSize: 16, fontWeight: '600', textAlign: 'right' },
  error: { color: palette.notice.danger.text, fontSize: 13 }, action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
})
