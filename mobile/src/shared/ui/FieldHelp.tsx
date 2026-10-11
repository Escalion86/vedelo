import { typography } from './theme'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { NavigationContext } from '@react-navigation/native'
import {
  AccessibilityInfo, findNodeHandle, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useThemeStyles } from './ThemeProvider'
import type { Palette } from './theme'

// Standalone UI previews may have no navigation context.
const helpNavigationContext = NavigationContext ?? createContext(undefined)

const focusAccessible = (node: View | Text | null) => {
  if (!node) return
  const handle = findNodeHandle(node)
  if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle)
}

/** Only local presentation state: never participates in the editor's draft or actions. */
export const FieldHelp = ({ text, label }: { text: string; label: string }) => {
  const styles = useThemeStyles(createStyles)
  const [open, setOpen] = useState(false)
  const navigation = useContext(helpNavigationContext)
  const trigger = useRef<View>(null)
  const heading = useRef<Text>(null)
  const input = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput>>(null)
  const wasOpen = useRef(false)
  useEffect(() => navigation?.addListener('blur', () => {
    wasOpen.current = false
    setOpen(false)
  }), [navigation])
  useEffect(() => {
    let frame: number | undefined
    if (!open && wasOpen.current) frame = requestAnimationFrame(() => {
      if (input.current) input.current.focus()
      else trigger.current?.focus()
      focusAccessible(trigger.current)
    })
    wasOpen.current = open
    return () => { if (frame !== undefined) cancelAnimationFrame(frame) }
  }, [open])
  const close = () => setOpen(false)
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`Подсказка: ${label}`}
      accessibilityState={{ expanded: open }} style={styles.trigger}
      onPress={(event) => {
        event?.stopPropagation?.()
        if (!open) input.current = TextInput.State.currentlyFocusedInput()
        setOpen((value) => !value)
      }}>
      <Text importantForAccessibility="no" accessibilityElementsHidden style={styles.icon}>ⓘ</Text>
    </Pressable>
    {open ? <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent
      onRequestClose={close} onShow={() => focusAccessible(heading.current)}>
      <View style={styles.layer}>
        <Pressable testID="field-help-outside" accessible={false} importantForAccessibility="no"
          style={StyleSheet.absoluteFill} onPress={close} />
        <SafeAreaView pointerEvents="box-none" style={styles.safeArea}>
          <View accessibilityViewIsModal style={styles.panel} testID="field-help-panel">
            <View style={styles.header}>
              <Text ref={heading} accessibilityRole="header" style={styles.heading}>{label}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Закрыть подсказку"
                style={styles.trigger} onPress={close}><Text style={styles.icon}>×</Text></Pressable>
            </View>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
              <Text selectable style={styles.text}>{text}</Text>
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal> : null}
  </>
}

/** A help action is a sibling of the label, never a child of a picker or checkbox. */
export const HelpLabel = ({ label, help, style }: { label: string; help?: string; style?: StyleProp<TextStyle> }) => {
  const styles = useThemeStyles(createStyles)
  if (!help) return <Text style={style}>{label}</Text>
  return <View style={styles.labelRow}>
    <Text style={[style, styles.label]}>{label}</Text>
    <FieldHelp key={label} label={label} text={help} />
  </View>
}

const createStyles = (p: Palette) => StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { flexShrink: 1 },
  trigger: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  icon: { fontFamily: typography.fontFamily, color: p.secondaryText, fontSize: 22 },
  layer: { flex: 1, backgroundColor: p.canvas },
  safeArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel: { width: '100%', maxWidth: 560, maxHeight: '100%', flexShrink: 1, backgroundColor: p.surface,
    borderColor: p.border, borderWidth: 1, borderRadius: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  heading: { fontFamily: typography.fontFamily, flex: 1, color: p.text, fontWeight: '700', fontSize: 18 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: 16, paddingTop: 8 },
  text: { fontFamily: typography.fontFamily, color: p.text, fontSize: 16, lineHeight: 24 },
})
