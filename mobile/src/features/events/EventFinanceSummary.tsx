import { StyleSheet, Text, View } from 'react-native'
import type { Event, Transaction } from '../../shared/domain/types'
import { SectionTitle, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { formatEventCardMoney } from './eventCard'
import { getEventDetailFinance } from './eventDetail'

export const EventFinanceSummary = ({ event, transactions }: { event: Event; transactions: Transaction[] }) => {
  const styles = useThemeStyles(createStyles)
  if (event.status === 'draft') return null
  const summary = getEventDetailFinance(event, transactions)
  return <Surface testID="event-finance-summary">
    <SectionTitle>Финансы</SectionTitle>
    <View style={styles.grid}>{[
      ['Договор', summary.contractSum], ['Получено', summary.paid], ['Расходы', summary.expense], ['Итог', summary.net],
    ].map(([label, amount]) => <Surface variant="kpi" key={label} style={styles.kpi}>
      <Text style={styles.label}>{label}</Text><Text style={styles.amount}>{formatEventCardMoney(Number(amount))}</Text>
    </Surface>)}</View>
    <Text style={styles.meta}>Получено по работе: {formatEventCardMoney(summary.clientPaid)}</Text>
    <Text style={styles.meta}>{summary.overpaid > 0 ? `Переплата: ${formatEventCardMoney(summary.overpaid)}` : `Осталось получить: ${formatEventCardMoney(summary.remaining)}`}</Text>
    <Text style={styles.muted}>Обязательства не входят в полученные оплаты и расходы.</Text>
  </Surface>
}
const createStyles = (p: Palette) => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, kpi: { flexGrow: 1, flexBasis: '45%', padding: 12, gap: 4 },
  label: { color: p.cardMuted, fontSize: 13 }, amount: { color: p.cardTitle, fontSize: 20, fontWeight: '600' },
  meta: { color: p.cardMeta, fontSize: 14 }, muted: { color: p.cardMuted, fontSize: 13, lineHeight: 18 },
})
