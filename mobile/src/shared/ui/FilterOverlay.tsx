import { useEffect, useRef, useState, type Ref } from 'react'
import {
  AccessibilityInfo, findNodeHandle, Modal, Pressable, ScrollView, StyleSheet, Text, View,
  useWindowDimensions, type PressableProps,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, useThemeStyles } from './ThemeProvider'
import { typography, type Palette } from './theme'

export const FilterControl = ({ title, expanded = false, selected = false, disabled,
  accessibilityState, style, ...props }: PressableProps & {
  title: string; expanded?: boolean; selected?: boolean; ref?: Ref<View>
}) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  return (
    <Pressable
      hitSlop={6}
      {...props}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, selected, expanded, disabled: Boolean(disabled) }}
      disabled={disabled}
      style={(state) => [styles.control, selected && styles.controlSelected,
        state.pressed && !disabled && (selected ? styles.controlSelectedPressed : styles.controlPressed), disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style]}
    >
      {({ pressed }) => <Text style={[styles.controlText, {
        color: selected ? palette.onPrimary : pressed && !disabled ? palette.secondaryPressedText : palette.secondaryText,
      }]}>{title}</Text>}
    </Pressable>
  )
}

export type FilterOption = { value: string; label: string; selected?: boolean; disabled?: boolean }
type Anchor = { x: number; bottom: number }
export const filterOverlayLayout = (
  viewport: { width: number; height: number },
  insets: { top: number; bottom: number; left: number; right: number },
  maxWidth: 260 | 340,
  anchor: Anchor,
) => {
  const width = Math.max(0, Math.min(maxWidth, viewport.width - insets.left - insets.right - 24))
  const left = Math.max(insets.left + 12, Math.min(anchor.x, viewport.width - insets.right - width - 12))
  // Keep at least three rows available when the trigger is near the bottom.
  const top = Math.max(insets.top + 12, Math.min(anchor.bottom + 4, viewport.height - insets.bottom - 156))
  return { width, left, top, maxHeight: Math.max(0, viewport.height - insets.bottom - top - 12) }
}

const focusAccessible = (node: View | Text | null) => {
  if (!node) return
  const handle = findNodeHandle(node)
  if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle)
}

/** Controlled overlay; the trigger is the only element participating in list layout. */
export const FilterOverlay = ({ title = 'Фильтры', visible, onOpen, onClose, options,
  onSelect, maxWidth = 340, selected = false, testID = 'filter-overlay' }: {
  title?: string
  visible: boolean
  onOpen: () => void
  onClose: () => void
  options: readonly FilterOption[]
  onSelect: (value: string) => void
  maxWidth?: 260 | 340
  selected?: boolean
  testID?: string
}) => {
  const styles = useThemeStyles(createStyles)
  const viewport = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const trigger = useRef<View>(null)
  const heading = useRef<Text>(null)
  const wasVisible = useRef(false)
  const [anchor, setAnchor] = useState<Anchor>({ x: insets.left + 12, bottom: insets.top + 48 })

  useEffect(() => {
    let focusFrame: number | undefined
    if (visible) {
      trigger.current?.measureInWindow((x, y, _width, height) => setAnchor({ x, bottom: y + height }))
    } else if (wasVisible.current) {
      focusFrame = requestAnimationFrame(() => {
        trigger.current?.focus()
        focusAccessible(trigger.current)
      })
    }
    wasVisible.current = visible
    return () => { if (focusFrame !== undefined) cancelAnimationFrame(focusFrame) }
  }, [visible, viewport.width, viewport.height])

  const layout = filterOverlayLayout(viewport, insets, maxWidth, anchor)
  return (
    <>
      <FilterControl ref={trigger} title={title} expanded={visible} selected={selected}
        onPress={onOpen} testID={`${testID}-trigger`} />
      <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent
        animationType="none" onRequestClose={onClose}
        onShow={() => focusAccessible(heading.current)}>
        {visible ? (
          <View style={styles.modal} testID={`${testID}-layer`}>
            <Pressable accessible={false} importantForAccessibility="no" style={StyleSheet.absoluteFill}
              onPress={onClose} testID={`${testID}-outside`} />
            <View accessibilityViewIsModal style={[styles.panel, layout]} testID={testID}>
              <View style={styles.headingRow}>
                <Text ref={heading} accessibilityRole="header" style={styles.heading}>{title}</Text>
                <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel="Закрыть фильтры"
                  onPress={onClose} style={styles.close}>
                  <Text style={styles.closeText}>×</Text>
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.options}>
                {options.map((option) => (
                  <Pressable key={option.value} accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: Boolean(option.selected), disabled: Boolean(option.disabled) }}
                    disabled={option.disabled}
                    onPress={() => onSelect(option.value)}
                    style={({ pressed }) => [styles.row, option.selected && styles.selectedRow,
                      pressed && styles.pressedRow, option.disabled && styles.disabled]}>
                    <Text style={styles.rowLabel}>{option.label}</Text>
                    {option.selected ? <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.check}>✓</Text> : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  )
}

const createStyles = (palette: Palette) => StyleSheet.create({
  control: { minHeight: 36, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6, gap: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: palette.secondaryBackground, borderColor: palette.secondaryBorder },
  controlSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
  controlSelectedPressed: { backgroundColor: palette.primaryPressed, borderColor: palette.primaryPressed },
  controlPressed: { backgroundColor: palette.secondaryPressedBackground, borderColor: palette.secondaryPressedBorder },
  controlText: { fontSize: 14, fontWeight: typography.nativeFilterWeight },
  disabled: { opacity: 0.65 },
  modal: { flex: 1 },
  panel: { position: 'absolute', backgroundColor: palette.canvas, borderColor: palette.toolbarBorder,
    borderWidth: 1, borderRadius: 10, overflow: 'hidden', elevation: 6 },
  headingRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12 },
  heading: { flex: 1, color: palette.text, fontSize: 15.2, fontWeight: '600' },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: palette.text, fontSize: 24 },
  options: { flexShrink: 1 },
  row: { minHeight: 48, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { flex: 1, color: palette.text, fontSize: 15.2 },
  check: { color: palette.selectionText, fontSize: 15.2 },
  selectedRow: { backgroundColor: palette.rowSelected },
  pressedRow: { backgroundColor: palette.rowPressed },
})
