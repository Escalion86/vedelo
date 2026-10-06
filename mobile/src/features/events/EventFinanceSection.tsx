import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { Transaction } from '../../shared/domain/types'
import type { EventDraft } from '../../shared/domain/eventForm'
import { categoryLabel } from '../../shared/domain/finance'
import { Button, Field, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { formatEventCardMoney } from './eventCard'
import {
  eventTransactionsFor, hasDepositPaidTransaction, isObligationTransaction, splitEventTransactions, transactionDateLabel,
} from './eventFinance'

const transactionTypeLabel = (type: Transaction['type']) => type === 'income' ? 'Доход' : 'Расход'

const formatTransactionDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export type EventFinanceSectionProps = {
  draft: EventDraft
  onChange: (draft: EventDraft) => void
  transactions: Transaction[]
  transactionsError?: boolean
  /** Локальный или серверный id работы: транзакции и документы доступны только после сохранения. */
  eventId: string
  documentsCount: number
  onAddTransaction: () => void
  onOpenTransaction: (transactionId: string) => void
  onDeleteTransaction: (transactionId: string) => void
  onOpenDocuments: () => void
  onRetryTransactions: () => void
}

/** Q: финансы работы. Обязательства — план, факт — только оплаченные транзакции. */
export const EventFinanceSection = ({
  draft, onChange, transactions, transactionsError = false, eventId, documentsCount,
  onAddTransaction, onOpenTransaction, onDeleteTransaction, onOpenDocuments, onRetryTransactions,
}: EventFinanceSectionProps) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const v = draft.values
  const related = eventTransactionsFor(transactions, eventId)
  const depositPaid = !transactionsError && hasDepositPaidTransaction(related)
  const split = splitEventTransactions(related)
  const setValues = (patch: Partial<typeof v>) => onChange({ ...draft, values: { ...v, ...patch } })
  const confirmDelete = (transaction: Transaction) => Alert.alert(
    'Удалить транзакцию?',
    'Транзакция будет удалена сейчас локально. Удаление будет передано при синхронизации.',
    [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => onDeleteTransaction(transaction._id) },
    ]
  )
  const renderRow = (transaction: Transaction) => (
    <View key={transaction._id} style={styles.transaction} testID={`event-transaction-${transaction._id}`}>
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionTitle}>
          {transactionTypeLabel(transaction.type)} · {formatEventCardMoney(Number(transaction.amount || 0))}
        </Text>
        <Text style={styles.transactionMeta}>
          {[categoryLabel(transaction.category), transaction.comment?.trim()].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.transactionMeta} testID={`event-transaction-${transaction._id}-date`}>
          {transactionDateLabel(transaction.paymentMethod)}: {formatTransactionDate(transaction.date)}
        </Text>
        {isObligationTransaction(transaction) ? (
          <View style={styles.chip}><Text style={styles.chipText}>Обязательство</Text></View>
        ) : null}
      </View>
      <Pressable accessibilityLabel="Редактировать транзакцию" accessibilityRole="button"
        onPress={() => onOpenTransaction(transaction._id)} style={styles.iconButton}>
        <MaterialCommunityIcons name="pencil-outline" size={20} color={palette.notice.warning.text} />
      </Pressable>
      <Pressable accessibilityLabel="Удалить транзакцию" accessibilityRole="button"
        onPress={() => confirmDelete(transaction)} style={styles.iconButton}>
        <MaterialCommunityIcons name="trash-can-outline" size={20} color={palette.notice.danger.text} />
      </Pressable>
    </View>
  )
  const groups = [
    ['Поступления', split.income], ['Расходы', split.expense], ['Обязательства', split.obligations],
  ] as const

  return (
    <View style={styles.section}>
      <Surface>
        <SectionTitle>Финансы</SectionTitle>
        <Field keyboardType="numeric" label="Договорная сумма"
          onChangeText={(contractSum) => setValues({ contractSum })} testID="event-contract-sum" value={v.contractSum} />
        {depositPaid ? (
          <Notice message="Задаток отмечен фактической транзакцией. Ожидание задатка скрыто." tone="info" />
        ) : (
          <>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: v.waitDeposit }}
              onPress={() => setValues({ waitDeposit: !v.waitDeposit })} style={styles.toggle}>
              <MaterialCommunityIcons name={v.waitDeposit ? 'checkbox-marked' : 'checkbox-blank-outline'}
                size={20} color={v.waitDeposit ? palette.primary : palette.cardMuted} />
              <Text style={styles.toggleText}>Ждем задаток</Text>
            </Pressable>
            {v.waitDeposit ? (
              <>
                <Field keyboardType="numeric" label="Сумма задатка"
                  onChangeText={(depositExpectedAmount) => setValues({ depositExpectedAmount })}
                  testID="event-deposit-amount" value={v.depositExpectedAmount} />
                <Field label="Дата ожидания задатка"
                  onChangeText={(depositDueAt) => setValues({ depositDueAt })}
                  placeholder="2026-07-20 10:00" testID="event-deposit-due" value={v.depositDueAt} />
              </>
            ) : null}
          </>
        )}
        <Field label="Комментарий по финансам" multiline
          onChangeText={(financeComment) => setValues({ financeComment })} testID="event-finance-comment" value={v.financeComment} />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: v.isByContract }}
          onPress={() => setValues({ isByContract: !v.isByContract })} style={styles.toggle}>
          <MaterialCommunityIcons name={v.isByContract ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={20} color={v.isByContract ? palette.primary : palette.cardMuted} />
          <Text style={styles.toggleText}>По договору</Text>
        </Pressable>
      </Surface>

      <Surface>
        <SectionTitle>Транзакции</SectionTitle>
        {transactionsError ? (
          <>
            <Notice message="Не удалось прочитать транзакции. Факт и обязательства недоступны." tone="danger" />
            <Button onPress={onRetryTransactions} title="Повторить загрузку транзакций" variant="secondary" />
          </>
        ) : (
          <>
            {eventId ? (
              <>
                {split.income.length || split.expense.length || split.obligations.length ? (
                  <>
                    <Text style={styles.summary} testID="event-finance-fact">
                      Факт: поступления {formatEventCardMoney(split.totals.income)} · расходы {formatEventCardMoney(split.totals.expense)}
                    </Text>
                    <Text style={styles.summaryMuted} testID="event-finance-obligations">
                      Обязательства: {formatEventCardMoney(split.totals.obligations)}
                    </Text>
                    {groups.map(([title, items]) => items.length ? (
                      <View key={title} style={styles.group}>
                        <Text style={styles.groupTitle}>{title}</Text>
                        {items.map(renderRow)}
                      </View>
                    ) : null)}
                  </>
                ) : null}
                <Button onPress={() => { if (eventId) onAddTransaction() }} title="Добавить транзакцию" variant="secondary" />
              </>
            ) : (
              <>
                <Text style={styles.muted}>Сначала сохраните заявку — после этого появятся связанные транзакции.</Text>
                <Button disabled onPress={() => undefined} title="Добавить транзакцию" variant="secondary" />
              </>
            )}
          </>
        )}
      </Surface>

      <Surface>
        <SectionTitle>Документы</SectionTitle>
        <Text style={styles.muted}>Документов: {documentsCount}</Text>
        {eventId ? (
          <Button onPress={onOpenDocuments} title="Файлы и документы" variant="secondary" />
        ) : (
          <>
            <Text style={styles.muted}>Файлы и документы доступны после сохранения заявки.</Text>
            <Button disabled onPress={() => undefined} title="Файлы и документы" variant="secondary" />
          </>
        )}
      </Surface>
    </View>
  )
}

const createStyles = (palette: Palette) => StyleSheet.create({
  section: { gap: 12 },
  toggle: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 40 },
  toggleText: { color: palette.text, fontSize: 14, fontWeight: '600' },
  summary: { color: palette.text, fontSize: 14, fontWeight: '700' },
  summaryMuted: { color: palette.cardMuted, fontSize: 14, fontWeight: '600' },
  group: { gap: 8 },
  groupTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
  transaction: {
    alignItems: 'center', borderColor: palette.border, borderRadius: 8, borderWidth: 1,
    flexDirection: 'row', gap: 8, padding: 10,
  },
  transactionInfo: { flex: 1, gap: 2, minWidth: 0 },
  transactionTitle: { color: palette.text, fontSize: 15, fontWeight: '600' },
  transactionMeta: { color: palette.cardMuted, fontSize: 13 },
  chip: {
    alignSelf: 'flex-start', borderColor: palette.notice.warning.border, borderRadius: 999,
    borderWidth: 1, backgroundColor: palette.notice.warning.background, paddingHorizontal: 8, paddingVertical: 2,
  },
  chipText: { color: palette.notice.warning.text, fontSize: 12, fontWeight: '700' },
  iconButton: { alignItems: 'center', justifyContent: 'center', minHeight: 40, minWidth: 40 },
  muted: { color: palette.cardMuted, fontSize: 14 },
})
