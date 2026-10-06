import { useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Button, FilterControl } from '../../shared/ui/components'
import { filterOverlayLayout } from '../../shared/ui/FilterOverlay'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { formatTransactionDateInput } from '../../shared/domain/finance'
import { monthCells, nextWeekend, rangeByDay, rangeLabel, type DateRange } from './filters'

export function TransactionPeriodFilter({ range, onChange, activeDates }: { range: DateRange; onChange: (range: DateRange) => void; activeDates: ReadonlySet<string> }) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const viewport = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const trigger = useRef<View>(null)
  const [visible, setVisible] = useState(false)
  const [draft, setDraft] = useState(range)
  const [cursor, setCursor] = useState(new Date())
  const [anchor, setAnchor] = useState({ x: 12, bottom: insets.top + 48 })
  const close = () => { setVisible(false); requestAnimationFrame(() => trigger.current?.focus()) }
  const open = () => {
    setDraft(range); setCursor(range.from ? new Date(`${range.from}T12:00:00`) : new Date())
    trigger.current?.measureInWindow((x, y, _width, height) => setAnchor({ x, bottom: y + height }))
    setVisible(true)
  }
  const layout = filterOverlayLayout(viewport, insets, 340, anchor)
  return <>
    <FilterControl ref={trigger} testID="transaction-period-trigger" title={rangeLabel(range)} selected={Boolean(range.from || range.to)} expanded={visible} onPress={open} />
    <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
      <View style={styles.layer}>
        <Pressable testID="transaction-period-outside" accessibilityRole="button" accessibilityLabel="Закрыть выбор периода" style={StyleSheet.absoluteFill} onPress={close} />
        <View testID="transaction-period" accessibilityViewIsModal style={[styles.panel, layout]}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <Text accessibilityRole="header" style={styles.heading}>Период</Text>
            <View style={styles.presets}>
              <FilterControl title="Сегодня" onPress={() => { const today = formatTransactionDateInput(new Date().toISOString()); setDraft({ from: today, to: today }); setCursor(new Date()) }} />
              <FilterControl title="Ближайшие выходные" onPress={() => { const weekend = nextWeekend(); setDraft(weekend); setCursor(new Date(`${weekend.from}T12:00:00`)) }} />
            </View>
            <Text style={styles.label}>{draft.from ? rangeLabel(draft) : 'Выберите дату или диапазон'}</Text>
            <View style={styles.monthHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="Предыдущий месяц" style={styles.arrow} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><MaterialCommunityIcons name="chevron-left" size={24} color={palette.text} /></Pressable>
              <Text style={styles.label}>{cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Следующий месяц" style={styles.arrow} onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><MaterialCommunityIcons name="chevron-right" size={24} color={palette.text} /></Pressable>
            </View>
            <View style={styles.grid}>{['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
            <View style={styles.grid}>{monthCells(cursor).map((day, index) => {
              const key = day ? formatTransactionDateInput(new Date(cursor.getFullYear(), cursor.getMonth(), day, 12).toISOString()) : ''
              const selected = Boolean(key && draft.from && key >= draft.from && key <= (draft.to || draft.from))
              return day ? <Pressable key={index} testID={`period-day-${key}`} accessibilityRole="button" accessibilityLabel={key} accessibilityState={{ selected }} style={[styles.day, selected && styles.selected]} onPress={() => setDraft(rangeByDay(draft, key))}>
                <Text style={[styles.dayText, selected && styles.selectedText]}>{day}</Text>{activeDates.has(key) ? <View testID={`period-active-${key}`} style={[styles.dot, selected && { backgroundColor: palette.onPrimary }]} /> : null}
              </Pressable> : <View key={index} style={styles.day} />
            })}</View>
            <Button title="Применить" onPress={() => { onChange(draft); close() }} />
            <Button title="Сбросить период" variant="secondary" onPress={() => { onChange({ from: '', to: '' }); close() }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  layer: { flex: 1 }, panel: { position: 'absolute', borderWidth: 1, borderColor: palette.border, borderRadius: 10, backgroundColor: palette.surface, elevation: 12 }, content: { padding: 12, gap: 10 },
  heading: { fontSize: 16, fontWeight: '600', color: palette.text }, label: { fontSize: 13, color: palette.cardMeta, flexShrink: 1 }, presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, arrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.285714%', textAlign: 'center', color: palette.cardMuted, fontSize: 11 }, day: { width: '14.285714%', minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 6 }, dayText: { color: palette.text, fontSize: 14 },
  selected: { backgroundColor: palette.primary }, selectedText: { color: palette.onPrimary }, dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.primary, position: 'absolute', bottom: 4 },
})
