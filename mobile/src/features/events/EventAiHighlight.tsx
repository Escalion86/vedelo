import type { PropsWithChildren } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { typography, type Palette } from '../../shared/ui/theme'

/** Подсветка — только presentation; в persisted payload её нет. */
export function EventAiHighlight({ active, field, children }: PropsWithChildren<{ active?: boolean; field: string }>) {
  const styles = useThemeStyles(createStyles)
  return <View testID={active ? `ai-field-${field}` : undefined} style={active ? styles.frame : undefined}>
    {active ? <Text style={styles.label}>Заполнено ИИ — проверьте</Text> : null}
    {children}
  </View>
}
const createStyles = (p: Palette) => StyleSheet.create({
  frame: { borderWidth: 2, borderColor: p.sectionAccent.messages, borderRadius: 8, padding: 6, gap: 4 },
  label: { fontFamily: typography.fontFamily, color: p.text, fontSize: 12, lineHeight: 17 },
})
