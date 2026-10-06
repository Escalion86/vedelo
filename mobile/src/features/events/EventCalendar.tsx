import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Surface } from '../../shared/ui/components'
import { radius, spacing, type Palette } from '../../shared/ui/theme'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import { buildCalendarMonth, formatMonthTitle, moveMonth, startOfMonth, toDateKey } from './calendar'

const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type Props = {
  month: Date
  selectedDateKey: string
  counts: Record<string, number>
  undatedCount: number
  onMonthChange: (month: Date) => void
  onSelectDate: (date: Date) => void
}

export const EventCalendar = ({
  month,
  selectedDateKey,
  counts,
  undatedCount,
  onMonthChange,
  onSelectDate,
}: Props) => {
  const styles = useThemeStyles(createStyles)
  const { palette: colors } = useTheme()
  const days = buildCalendarMonth(month)
  const changeMonth = (amount: number) => {
    const next = moveMonth(month, amount)
    onMonthChange(next)
    onSelectDate(next)
  }
  const selectToday = () => {
    const today = new Date()
    onMonthChange(startOfMonth(today))
    onSelectDate(today)
  }

  return (
    <Surface>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Предыдущий месяц" hitSlop={8} style={styles.iconButton} onPress={() => changeMonth(-1)}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.monthTitle}>{formatMonthTitle(month)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Следующий месяц" hitSlop={8} style={styles.iconButton} onPress={() => changeMonth(1)}>
          <MaterialCommunityIcons name="chevron-right" size={26} color={colors.text} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" testID="calendar-today" style={styles.todayButton} onPress={selectToday}>
        <Text style={styles.todayText}>Сегодня</Text>
      </Pressable>
      <View style={styles.weekRow}>
        {weekDays.map((day) => <Text key={day} style={styles.weekDay}>{day}</Text>)}
      </View>
      <View style={styles.grid}>
        {days.map((day) => {
          const count = counts[day.dateKey] || 0
          const selected = day.dateKey === selectedDateKey
          return (
            <Pressable
              key={day.dateKey}
              accessibilityRole="button"
              accessibilityLabel={`${day.date.toLocaleDateString('ru-RU')}${count ? `, записей: ${count}` : ', записей нет'}`}
              accessibilityState={{ selected }}
              testID={`calendar-day-${day.dateKey}`}
              style={[styles.day, selected && styles.daySelected, day.isToday && !selected && styles.dayToday]}
              onPress={() => {
                if (!day.inMonth) onMonthChange(startOfMonth(day.date))
                onSelectDate(day.date)
              }}
            >
              <Text style={[styles.dayText, !day.inMonth && styles.dayOutside, selected && styles.dayTextSelected]}>{day.day}</Text>
              {count ? <View style={[styles.count, selected && styles.countSelected]}><Text style={[styles.countText, selected && styles.countTextSelected]}>{count > 9 ? '9+' : count}</Text></View> : null}
            </Pressable>
          )
        })}
      </View>
      {undatedCount ? <Text style={styles.undated}>Без даты: {undatedCount}. Они доступны в режиме списка.</Text> : null}
    </Surface>
  )
}

const createStyles = (colors: Palette) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.kpiBackground },
  monthTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  todayButton: { alignSelf: 'center', minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.emptyIconBackground },
  todayText: { color: colors.selectionText, fontSize: 13, fontWeight: '700' },
  weekRow: { flexDirection: 'row' },
  weekDay: { width: '14.2857%', color: colors.cardMuted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.2857%', minHeight: 46, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radius.sm },
  daySelected: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1, borderColor: colors.primary },
  dayText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  dayOutside: { color: colors.cardMuted },
  dayTextSelected: { color: colors.onPrimary },
  count: { minWidth: 17, height: 17, paddingHorizontal: 3, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.emptyIconBackground },
  countSelected: { backgroundColor: colors.surface },
  countText: { color: colors.selectionText, fontSize: 9, fontWeight: '800' },
  countTextSelected: { color: colors.primary },
  undated: { color: colors.cardMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
})

