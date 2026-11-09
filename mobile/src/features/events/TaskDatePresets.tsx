import { StyleSheet, View } from 'react-native'
import { Button } from '../../shared/ui/components'
import { formatEventDateInput, parseEventDateInput } from '../../shared/domain/eventForm'
import { localDay } from '../../shared/ui/periodPickerDates'

const days = [[1, 'Завтра'], [2, 'Послезавтра'], [3, 'Через 2 дня'], [7, 'Через неделю']] as const
const hours = [11, 12, 18, 19]

export function TaskDatePresets({ value, onChange, disabled }: {
  value: string; onChange: (value: string) => void; disabled?: boolean
}) {
  const iso = parseEventDateInput(value || '')
  const current = iso ? new Date(iso) : null
  const now = new Date()
  const choose = (label: string, selected: boolean, date: Date) => <Button key={label} title={label}
    variant={selected ? 'primary' : 'secondary'} accessibilityState={{ selected }} disabled={disabled}
    onPress={() => onChange(formatEventDateInput(date.toISOString()))} />
  return <>
    <View style={styles.row}>{days.map(([offset, label]) => {
      const date = new Date(now)
      const time = current || now
      date.setDate(date.getDate() + offset)
      date.setHours(time.getHours(), time.getMinutes(), 0, 0)
      return choose(label, Boolean(current && localDay(current) === localDay(date)), date)
    })}</View>
    <View style={styles.row}>{hours.map(hour => {
      const date = new Date(current || now)
      date.setHours(hour, 0, 0, 0)
      return choose(`${hour}:00`, Boolean(current && current.getHours() === hour && current.getMinutes() === 0), date)
    })}</View>
  </>
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 } })
