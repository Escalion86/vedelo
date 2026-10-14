import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SectionTitle, Surface } from '../../shared/ui/components'
import { HelpLabel } from '../../shared/ui/FieldHelp'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import { typography, type Palette } from '../../shared/ui/theme'
import { money } from './statistics'
import type { MonthStat } from './monthlyStatistics'

export function MonthlyProfitChart({ months }: { months: MonthStat[] }) {
  const styles = useThemeStyles(createStyles), { palette } = useTheme()
  const [selectedKey, select] = useState<string | null>(null)
  const selected = months.find(item => item.monthKey === selectedKey)
  const max = Math.max(1, ...months.map(item => Math.abs(item.profit) + item.paymentLeft))
  return <Surface testID="statistics-monthly-chart">
    <SectionTitle help={getFieldHelp('statistics.monthGrouping')}>Прибыль по месяцам</SectionTitle>
    <View style={styles.legend}><Text style={styles.profit}>● Текущая прибыль</Text><Text style={styles.left}>● Недооплачено</Text></View>
    <HelpLabel label="Ожидаемая прибыль" help={getFieldHelp('statistics.expectedProfit')} style={styles.text} />
    <Text testID="statistics-expected-caption" style={styles.meta}>Ожидаемая прибыль — текущая прибыль + недооплачено.</Text>
    {months.length ? <ScrollView horizontal testID="statistics-month-scroll" showsHorizontalScrollIndicator contentContainerStyle={styles.plot}>
      {months.map(month => <Pressable key={month.monthKey} testID={`statistics-month-${month.monthKey}`} accessibilityRole="button"
        accessibilityLabel={`${month.month}: текущая прибыль ${money(month.profit)}, недооплачено ${money(month.paymentLeft)}, ожидаемая прибыль ${money(month.profit + month.paymentLeft)}`}
        accessibilityState={{ selected: selectedKey === month.monthKey }} onPress={() => select(month.monthKey)} style={[styles.column, selectedKey === month.monthKey && styles.selected]}>
        <View style={styles.positive}>
          <View testID={`statistics-left-${month.monthKey}`} style={{ width: 24, height: month.paymentLeft / max * 100, backgroundColor: palette.notice.danger.text, opacity: month.isUnfinished ? 0.75 : 1 }} />
          <View testID={`statistics-profit-${month.monthKey}`} style={{ width: 24, height: Math.max(month.profit, 0) / max * 100, backgroundColor: palette.notice.info.text }} />
        </View>
        <View style={styles.zero} />
        <View style={styles.negative}><View style={{ width: 24, height: Math.max(-month.profit, 0) / max * 100, backgroundColor: palette.notice.info.text }} /></View>
        <Text style={styles.meta}>{month.month.slice(0, 3)}</Text><Text style={styles.meta}>{money(month.profit + month.paymentLeft)}</Text>
      </Pressable>)}
    </ScrollView> : <Text style={styles.meta}>Нет месячных данных. Для графика выберите год.</Text>}
    {selected ? <View testID="statistics-month-details" style={styles.details}><Text style={styles.text}>{selected.month}</Text><Text style={styles.text}>Текущая прибыль: {money(selected.profit)}</Text><Text style={styles.text}>Недооплачено: {money(selected.paymentLeft)}</Text><Text style={styles.text}>Ожидаемая прибыль: {money(selected.profit + selected.paymentLeft)}</Text><Text style={styles.meta}>Работ: {selected.eventCount}</Text></View> : null}
  </Surface>
}
const createStyles = (p: Palette) => StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  profit: { fontFamily: typography.fontFamily, color: p.notice.info.text, fontSize: 12 },
  left: { fontFamily: typography.fontFamily, color: p.notice.danger.text, fontSize: 12 },
  text: { fontFamily: typography.fontFamily, color: p.text, fontSize: 14 },
  meta: { fontFamily: typography.fontFamily, color: p.cardMuted, fontSize: 12 },
  plot: { gap: 8 }, column: { minWidth: 68, minHeight: 240, alignItems: 'center', padding: 4, borderWidth: 1, borderColor: 'transparent', borderRadius: 8 },
  positive: { height: 100, justifyContent: 'flex-end' }, negative: { height: 100 }, zero: { width: '100%', height: 1, backgroundColor: p.border },
  selected: { borderColor: p.primary, backgroundColor: p.rowSelected }, details: { gap: 8 },
})
