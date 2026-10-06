import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { CompactField } from '../../shared/ui/components'
import { QuickActionsSheet } from '../../shared/ui/QuickContacts'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
export type PickerOption = { id: string; title: string; meta?: string; search?: string }
export function FinanceRelationPicker({ label, value, options, onChange, disabled = false, testID }: { label: string; value: string; options: PickerOption[]; onChange: (id: string) => void; disabled?: boolean; testID: string }) {
  const { palette } = useTheme()
  const styles = useThemeStyles(createStyles)
  const [visible, setVisible] = useState(false)
  const [search, setSearch] = useState('')
  const selected = options.find((item) => item.id === value)
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase(), digits = query.replace(/\D/g, '')
    return options.filter((item) => !query || `${item.title} ${item.meta || ''} ${item.search || ''}`.toLowerCase().includes(query) || Boolean(digits && item.search?.replace(/\D/g, '').includes(digits)))
  }, [options, search])
  const choose = (id: string) => { onChange(id); setVisible(false) }
  return <View>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.row}>
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`Выбрать: ${label}`} accessibilityState={{ disabled, expanded: visible }} disabled={disabled} style={[styles.field, disabled && styles.disabled]} onPress={() => { setSearch(''); setVisible(true) }}>
        <View style={styles.grow}><Text numberOfLines={1} style={styles.text}>{selected?.title || (value ? 'Связанная запись недоступна' : 'Не выбран')}</Text>{selected?.meta ? <Text numberOfLines={1} style={styles.meta}>{selected.meta}</Text> : null}</View>
        <MaterialCommunityIcons name="chevron-down" size={20} color={palette.cardMuted} />
      </Pressable>
      {value ? <Pressable accessibilityRole="button" accessibilityLabel={`Очистить: ${label}`} disabled={disabled} style={styles.clear} onPress={() => choose('')}><MaterialCommunityIcons name="close" size={20} color={palette.cardMuted} /></Pressable> : null}
    </View>
    <QuickActionsSheet title={label} visible={visible && !disabled} onClose={() => setVisible(false)}>
      <CompactField testID={`${testID}-search`} label={`Поиск: ${label}`} value={search} onChangeText={setSearch} autoCorrect={false} />
      <Pressable accessibilityRole="button" style={styles.option} onPress={() => choose('')}><Text style={styles.text}>Не выбран</Text></Pressable>
      {matches.slice(0, 40).map((item) => <Pressable key={item.id} testID={`${testID}-option-${item.id}`} accessibilityRole="button" accessibilityState={{ selected: item.id === value }} style={styles.option} onPress={() => choose(item.id)}><Text style={styles.text}>{item.title}</Text>{item.meta ? <Text style={styles.meta}>{item.meta}</Text> : null}</Pressable>)}
      {!matches.length ? <Text style={styles.meta}>Ничего не найдено</Text> : null}
      {matches.length > 40 ? <Text style={styles.meta}>Показаны первые 40. Уточните поиск.</Text> : null}
    </QuickActionsSheet>
  </View>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  label: { color: palette.cardMeta, fontSize: 13, marginBottom: 6 }, row: { flexDirection: 'row', gap: 8 }, grow: { flex: 1, minWidth: 0 },
  field: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 6, borderColor: palette.border, paddingHorizontal: 12, gap: 8, backgroundColor: palette.surface },
  text: { color: palette.text, fontSize: 14 }, meta: { color: palette.cardMuted, fontSize: 12 }, option: { minHeight: 44, padding: 10, gap: 4, borderBottomWidth: 1, borderColor: palette.border }, clear: { width: 40, justifyContent: 'center', alignItems: 'center' }, disabled: { opacity: 0.65 },
})
