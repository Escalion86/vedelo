import type { PropsWithChildren } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { FieldHelp } from '../../shared/ui/FieldHelp'
import { Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import { typography, type Palette } from '../../shared/ui/theme'

export function CompactEventSection({ id, title, summary, help, open, onToggle, ai, error, children }: PropsWithChildren<{
  id: string; title: string; summary: string; help?: string; open: boolean; onToggle: () => void; ai?: boolean; error?: string
}>) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  return <Surface testID={`event-compact-${id}`} style={[styles.section, ai && styles.ai]}>
    <View style={styles.header}>
      <Pressable testID={`event-compact-${id}-toggle`} accessibilityRole="button" accessibilityLabel={title}
        accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.toggle}>
        <Text style={styles.title}>{title}</Text><Text style={styles.summary}>{summary}</Text>
        {ai ? <Text testID={`event-compact-${id}-ai`} style={styles.summary}>Заполнено ИИ — проверьте</Text> : null}
      </Pressable>
      {help ? <FieldHelp label={title} text={help} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${open ? 'Свернуть' : 'Раскрыть'}: ${title}`}
        accessibilityState={{ expanded: open }} onPress={onToggle} style={styles.arrow}>
        <MaterialCommunityIcons name={open ? 'chevron-down' : 'chevron-right'} color={palette.cardMuted} size={24} />
      </Pressable>
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {open ? <View style={styles.body}>{children}</View> : null}
  </Surface>
}
const createStyles = (p: Palette) => StyleSheet.create({
  section: { padding: 8, gap: 0 }, ai: { borderWidth: 2, borderColor: p.sectionAccent.messages },
  header: { flexDirection: 'row', alignItems: 'center' }, toggle: { flex: 1, minWidth: 0, minHeight: 56, padding: 4, gap: 4, justifyContent: 'center' },
  title: { fontFamily: typography.fontFamily, color: p.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  summary: { fontFamily: typography.fontFamily, color: p.cardMuted, fontSize: 13, lineHeight: 18 },
  arrow: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, body: { gap: 12, paddingTop: 8 },
  error: { fontFamily: typography.fontFamily, color: p.notice.danger.text, fontSize: 14, lineHeight: 20 },
})
