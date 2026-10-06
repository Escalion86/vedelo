import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { StatusChip } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import { spacing, type Palette } from '../../shared/ui/theme'
import { statusPresentation, type GoogleStatus, type ProviderStatus } from './integrationContract'

export function IntegrationRow({ title, description, state, icon, selected, onPress }: {
  title: string; description: string; state?: ProviderStatus | GoogleStatus
  icon: keyof typeof MaterialCommunityIcons.glyphMap; selected?: boolean; onPress: () => void
}) {
  const styles = useThemeStyles(createStyles); const { palette } = useTheme()
  const status = statusPresentation(state)
  return <Pressable accessibilityRole="button" accessibilityLabel={`Настроить ${title}`} accessibilityState={{ expanded: selected }} onPress={onPress}
    style={({ pressed }) => [styles.row, { backgroundColor: pressed || selected ? palette.rowSelected : 'transparent' }]}>
    <MaterialCommunityIcons name={icon} size={22} color={palette.primary} />
    <View style={styles.grow}><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text><View style={styles.status}><StatusChip {...status} /></View></View>
    <MaterialCommunityIcons name={selected ? 'chevron-up' : 'chevron-down'} size={24} color={palette.cardMuted} />
  </Pressable>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 64, padding: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, borderRadius: 8 },
  grow: { flex: 1, minWidth: 0 }, title: { color: palette.text, fontSize: 14, fontWeight: '700' },
  description: { color: palette.cardMeta, fontSize: 12, lineHeight: 17, marginTop: 2 }, status: { alignSelf: 'flex-start', marginTop: 4, maxWidth: '100%' },
})
