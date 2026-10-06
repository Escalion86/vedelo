import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import { StatusChip } from '../../shared/ui/components'
import type { Palette } from '../../shared/ui/theme'
import { phaseLabel, phaseTone } from './documentUi'

export const DocumentRowView = ({ title, subtitle, onOpen, children, disabled = false, status }: {
  title: string; subtitle?: string; onOpen: () => void; children?: ReactNode; disabled?: boolean; status?: string
}) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  return <View style={styles.row}>
    <MaterialCommunityIcons name="file-document-outline" size={22} color={palette.primary} />
    <Pressable accessibilityRole="button" accessibilityLabel={`Открыть ${title}`} disabled={disabled} onPress={onOpen} style={styles.grow}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      {status ? <StatusChip label={phaseLabel(status)} tone={phaseTone(status)} /> : null}
      {status === 'failed' ? <Text style={styles.muted}>Не удалось отправить. Проверьте сеть и доступ, затем повторите.</Text> : null}
    </Pressable>
    <View style={styles.actions}>{children}</View>
  </View>
}
export const DocumentAction = ({ icon, label, onPress, disabled, danger = false, warning = false, testID }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void; disabled?: boolean; danger?: boolean; warning?: boolean; testID?: string
}) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}>
    <MaterialCommunityIcons name={icon} size={21} color={danger ? palette.notice.danger.text : warning ? palette.notice.warning.text : palette.primary} />
  </Pressable>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
  grow: { flex: 1, minWidth: 0, gap: 4 }, title: { color: palette.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  muted: { color: palette.cardMuted, fontSize: 12, lineHeight: 18 }, actions: { flexDirection: 'row', flexShrink: 0 },
  action: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.55 },
})
