import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { badgeLabel, type MenuItem } from './menu'

export function MenuRow({ title, icon, onPress, nested, expanded, selected, disabled, badge = 0, testID }: {
  title: string; icon: MenuItem['icon']; onPress: () => void; nested?: boolean
  expanded?: boolean; selected?: boolean; disabled?: boolean; badge?: number; testID?: string
}) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  return <Pressable accessibilityRole="button" accessibilityLabel={title} testID={testID}
    accessibilityState={{ expanded, selected, disabled: Boolean(disabled) }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.row, nested && styles.nested,
      selected && styles.selected, pressed && styles.pressed, disabled && styles.disabled]}>
    <MaterialCommunityIcons name={icon} size={20} color={palette.secondaryText} />
    <Text style={styles.title}>{title}</Text>
    {badge > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{badgeLabel(badge)}</Text></View> : null}
    {expanded !== undefined ? <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={palette.secondaryText} /> : null}
  </Pressable>
}

const createStyles = (palette: Palette) => StyleSheet.create({
  row: { minHeight: 42, borderRadius: 9, gap: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' },
  nested: { paddingLeft: 34 },
  title: { flex: 1, color: palette.secondaryText, fontSize: 13, fontWeight: '600' },
  selected: { backgroundColor: palette.rowSelected },
  pressed: { backgroundColor: palette.rowPressed }, disabled: { opacity: 0.65 },
  badge: { borderRadius: 999, paddingHorizontal: 6, minHeight: 20, justifyContent: 'center', backgroundColor: palette.counterBadge.background },
  badgeText: { color: palette.counterBadge.text, fontSize: 11, fontWeight: '700' },
})
