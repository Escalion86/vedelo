import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme, useThemeStyles } from './ThemeProvider'
import { typography, type Palette } from './theme'
import { fullDay, localDay, parsePeriodDay, periodCalendarDate, periodMonthCells } from './periodPickerDates'

/** A calendar day, without converting local midnight to UTC. Saving is explicit. */
export function SingleDateCalendar({ value, onChange, minDay, disabled = false }: {
  value: string; onChange: (day: string) => void; minDay?: string; disabled?: boolean
}) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const [cursor, setCursor] = useState(() => parsePeriodDay(value) || new Date())
  const arrow = (offset: -1 | 1, unavailable: boolean) => <Pressable accessibilityRole="button"
    accessibilityLabel={offset < 0 ? 'Предыдущий месяц' : 'Следующий месяц'} disabled={unavailable}
    accessibilityState={{ disabled: unavailable }} style={[styles.arrow, unavailable && styles.disabled]}
    onPress={() => setCursor(periodCalendarDate(cursor.getFullYear(), cursor.getMonth() + offset, 1))}>
    <MaterialCommunityIcons name={offset < 0 ? 'chevron-left' : 'chevron-right'} size={24} color={palette.text} />
  </Pressable>
  return <View style={styles.content}>
    <View style={styles.navigation}>
      {arrow(-1, disabled || (minDay ? localDay(cursor).slice(0, 7) <= minDay.slice(0, 7) : cursor.getFullYear() === 1 && cursor.getMonth() === 0))}
      <Text accessibilityRole="header" style={styles.month}>{cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</Text>
      {arrow(1, disabled || cursor.getFullYear() === 9999 && cursor.getMonth() === 11)}
    </View>
    <View style={styles.grid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
    </View>
    <View style={styles.grid}>{periodMonthCells(cursor).map((day, index) => {
      if (!day) return <View key={`blank-${index}`} style={styles.day} />
      const key = localDay(periodCalendarDate(cursor.getFullYear(), cursor.getMonth(), day))
      const selected = key === value, unavailable = disabled || Boolean(minDay && key < minDay)
      return <Pressable key={key} testID={`single-day-${key}`} accessibilityRole="button" accessibilityLabel={fullDay(key)}
        accessibilityState={{ selected, disabled: unavailable }} disabled={unavailable} onPress={() => onChange(key)}
        style={[styles.day, selected && styles.selected, unavailable && styles.disabled]}>
        <Text style={[styles.text, selected && styles.selectedText]}>{day}</Text>
      </Pressable>
    })}</View>
    <Text accessibilityLiveRegion="polite" style={styles.text}>Выбрано: {fullDay(value)}</Text>
  </View>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  content: { gap: 8 }, navigation: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrow: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  month: { flex: 1, textAlign: 'center', fontFamily: typography.fontFamily, color: palette.text, fontSize: 16, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', textAlign: 'center', color: palette.cardMuted, fontFamily: typography.fontFamily },
  day: { width: '14.2857%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  selected: { backgroundColor: palette.rowSelected, borderWidth: 1, borderColor: palette.primary },
  selectedText: { color: palette.primary, fontWeight: '700' }, disabled: { opacity: 0.4 },
  text: { fontFamily: typography.fontFamily, color: palette.text, fontSize: 14 },
})
