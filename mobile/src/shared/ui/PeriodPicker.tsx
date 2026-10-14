import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, findNodeHandle, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Button } from './components'
import { CompactField } from './CompactField'
import { useTheme, useThemeStyles } from './ThemeProvider'
import { typography, type Palette } from './theme'
import { compactPeriodSummary, periodCalendarDate, fullDay, localDay, manualDay, parsePeriodDay, periodError, periodMonthCells, periodPresets, periodSummary, readManualDay, type PeriodPreset, type PeriodRange } from './periodPickerDates'
export type { PeriodRange, PeriodPreset } from './periodPickerDates'

const focusAccessible = (node: View | Text | null) => {
  const handle = node ? findNodeHandle(node) : null
  if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle)
}
export function PeriodPicker({ value, onChange, label = 'Период', disabled = false, activeDates, extraPresets = [], error: externalError, testID = 'period-picker' }: {
  value: PeriodRange; onChange: (value: PeriodRange) => void; label?: string; disabled?: boolean
  activeDates?: ReadonlySet<string>; extraPresets?: readonly PeriodPreset[]; error?: string; testID?: string
}) {
  const styles = useThemeStyles(createStyles), { palette } = useTheme()
  const viewport = useWindowDimensions(), insets = useSafeAreaInsets()
  const trigger = useRef<View>(null), heading = useRef<Text>(null), wasVisible = useRef(false)
  const [visible, setVisible] = useState(false), [stage, setStage] = useState<'presets' | 'calendar' | 'manual'>('presets')
  const [draft, setDraft] = useState(value), [inputs, setInputs] = useState({ from: '', to: '' })
  const [cursor, setCursor] = useState(new Date()), [selectingEnd, setSelectingEnd] = useState(false)
  const close = () => setVisible(false)
  useEffect(() => { if (disabled) setVisible(false) }, [disabled])
  useEffect(() => {
    let frame: number | undefined
    if (visible) frame = requestAnimationFrame(() => focusAccessible(heading.current))
    else if (wasVisible.current) frame = requestAnimationFrame(() => { trigger.current?.focus(); focusAccessible(trigger.current) })
    wasVisible.current = visible
    return () => { if (frame !== undefined) cancelAnimationFrame(frame) }
  }, [visible, stage])
  const open = () => {
    if (disabled) return
    setDraft({ ...value }); setInputs({ from: manualDay(value.from), to: manualDay(value.to) })
    setCursor(parsePeriodDay(value.from || value.to) || new Date()); setSelectingEnd(false); setStage('presets'); setVisible(true)
  }
  const presets = [...periodPresets(), ...extraPresets]
  const selectedPreset = presets.find((preset) => { const range = preset.range(); return range.from === value.from && range.to === value.to })
  const summary = periodSummary(value)
  const from = readManualDay(inputs.from), to = readManualDay(inputs.to)
  const manualRange = { from: from || '', to: to || '' }
  const draftError = stage === 'manual' ? from === null || to === null ? 'Введите существующую дату в формате ДД.ММ.ГГГГ' : periodError(manualRange) : periodError(draft)
  const candidate = stage === 'manual' ? manualRange : draft
  const apply = (range: PeriodRange) => { if (!disabled && !periodError(range)) { onChange({ ...range }); close() } }
  const updateDraft = (next: PeriodRange) => { setDraft(next); setInputs({ from: manualDay(next.from), to: manualDay(next.to) }) }
  const changeMonth = (offset: number) => setCursor(periodCalendarDate(cursor.getFullYear(), cursor.getMonth() + offset, 1))
  const dayPress = (key: string) => {
    if (!selectingEnd || !draft.from) { updateDraft({ from: key, to: key }); setSelectingEnd(true) }
    else {
      updateDraft(key < draft.from ? { from: key, to: draft.from } : { from: draft.from, to: key })
      setSelectingEnd(false)
    }
  }
  const toggleManual = () => {
    if (stage === 'manual') {
      if (draftError) return
      setDraft(manualRange); setCursor(parsePeriodDay(manualRange.from || manualRange.to) || cursor); setSelectingEnd(false); setStage('calendar')
    } else setStage('manual')
  }
  const caption = stage === 'presets' ? 'Выберите период' : 'Выберите даты'
  return <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.fieldRow}>
      <Pressable ref={trigger} testID={`${testID}-trigger`} accessibilityRole="button" accessibilityLabel={`${label}: ${summary}`}
        accessibilityHint="Открыть выбор периода" accessibilityState={{ expanded: visible, selected: Boolean(value.from || value.to), disabled }} disabled={disabled} onPress={open}
        style={({ pressed }) => [styles.field, pressed && styles.focused, disabled && styles.disabled]}>
        <MaterialCommunityIcons name="calendar-month-outline" size={20} color={palette.generalText} />
        <Text style={styles.value}>{selectedPreset?.label || compactPeriodSummary(value)}</Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color={palette.generalText} />
      </Pressable>
      {value.from || value.to ? <Pressable testID={`${testID}-reset`} accessibilityRole="button" accessibilityLabel="Сбросить период" accessibilityState={{ disabled }} disabled={disabled}
        onPress={() => apply({ from: '', to: '' })} style={({ pressed }) => [styles.reset, pressed && styles.focused, disabled && styles.disabled]}>
        <MaterialCommunityIcons name="restore" size={22} color={palette.secondaryText} />
      </Pressable> : null}
    </View>
    {externalError ? <Text accessibilityRole="alert" style={styles.error}>{externalError}</Text> : null}
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} onShow={() => focusAccessible(heading.current)}>
      {visible ? <KeyboardAvoidingView testID={`${testID}-layer`} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.layer, { paddingTop: insets.top + 12, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right, justifyContent: viewport.width <= 600 ? 'flex-end' : 'center' }]}>
        <Pressable testID={`${testID}-outside`} accessible={false} importantForAccessibility="no" style={StyleSheet.absoluteFill} onPress={close} />
        <View testID={testID} accessibilityViewIsModal style={[styles.panel, { width: viewport.width <= 600 ? viewport.width - insets.left - insets.right : Math.min(390, viewport.width - insets.left - insets.right - 32), maxHeight: viewport.height - insets.top - insets.bottom - 12 }]}>
          <View style={styles.headingRow}>
            {stage !== 'presets' ? <Pressable accessibilityRole="button" accessibilityLabel="Назад к готовым периодам" disabled={disabled} accessibilityState={{ disabled }} style={styles.iconButton} onPress={() => { updateDraft({ ...value }); setSelectingEnd(false); setStage('presets') }}><MaterialCommunityIcons name="chevron-left" size={24} color={palette.text} /></Pressable> : null}
            <Text ref={heading} accessibilityRole="header" style={styles.heading}>{caption}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть выбор периода" style={styles.iconButton} onPress={close}><MaterialCommunityIcons name="close" size={24} color={palette.text} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content}>
            {stage === 'presets' ? <>
              {presets.map((preset) => <Button key={preset.label} title={`${preset.label}${selectedPreset?.label === preset.label ? ' ✓' : ''}`} accessibilityLabel={preset.label} variant={selectedPreset?.label === preset.label ? 'primary' : 'secondary'} disabled={disabled}
                accessibilityState={{ selected: selectedPreset?.label === preset.label }} onPress={() => apply(preset.range())} />)}
              <Button title="Выбрать даты" variant="secondary" disabled={disabled} onPress={() => setStage('calendar')} />
            </> : <>
              {stage === 'calendar' ? <>
                <View style={styles.monthHeader}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Предыдущий месяц" disabled={disabled || cursor.getFullYear() === 1 && cursor.getMonth() === 0} style={styles.iconButton} onPress={() => changeMonth(-1)}><MaterialCommunityIcons name="chevron-left" size={24} color={palette.text} /></Pressable>
                  <Text style={styles.month}>{cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Следующий месяц" disabled={disabled || cursor.getFullYear() === 9999 && cursor.getMonth() === 11} style={styles.iconButton} onPress={() => changeMonth(1)}><MaterialCommunityIcons name="chevron-right" size={24} color={palette.text} /></Pressable>
                </View>
                <View style={styles.grid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
                <View style={styles.grid}>{periodMonthCells(cursor).map((day, index) => {
                  if (!day) return <View key={`blank-${index}`} style={styles.day} />
                  const key = localDay(periodCalendarDate(cursor.getFullYear(), cursor.getMonth(), day))
                  const endpoint = key === draft.from || key === draft.to
                  const selected = endpoint || Boolean(draft.from && draft.to && key >= draft.from && key <= draft.to)
                  const active = Boolean(activeDates?.has(key))
                  return <Pressable key={key} testID={`period-day-${key}`} accessibilityRole="button" accessibilityLabel={fullDay(key)}
                    accessibilityHint={[key === draft.from ? 'Начало периода' : '', key === draft.to ? 'Конец периода' : '', active ? 'Есть транзакции' : ''].filter(Boolean).join(', ')}
                    accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => dayPress(key)} style={[styles.day, selected && styles.selected, endpoint && styles.endpoint]}>
                    <Text style={[styles.dayText, selected && styles.selectedText]}>{day}{selected ? ' ✓' : ''}</Text>
                    {active ? <Text testID={`period-active-${key}`} style={[styles.active, selected && styles.selectedText]} accessibilityElementsHidden importantForAccessibility="no">•</Text> : null}
                  </Pressable>
                })}</View>
                <Text accessibilityLiveRegion="polite" style={styles.meta}>{selectingEnd ? 'Выберите конечную дату' : 'Выберите начало периода'}</Text>
              </> : <>
                <CompactField label="С даты" value={inputs.from} onChangeText={(text) => setInputs((current) => ({ ...current, from: text }))} editable={!disabled} placeholder="ДД.ММ.ГГГГ" keyboardType="numbers-and-punctuation" maxLength={10} error={from === null ? draftError : undefined} />
                <CompactField label="По дату" value={inputs.to} onChangeText={(text) => setInputs((current) => ({ ...current, to: text }))} editable={!disabled} placeholder="ДД.ММ.ГГГГ" keyboardType="numbers-and-punctuation" maxLength={10} error={to === null ? draftError : undefined} />
                <Text style={styles.meta}>Формат: ДД.ММ.ГГГГ. Можно оставить одну границу пустой.</Text>
              </>}
              <Button title={stage === 'manual' ? 'Выбрать в календаре' : 'Ввести даты вручную'} variant="secondary" disabled={disabled || stage === 'manual' && Boolean(draftError)} accessibilityState={{ expanded: stage === 'manual' }} onPress={toggleManual} />
              {draftError && from !== null && to !== null ? <Text accessibilityRole="alert" style={styles.error}>{draftError}</Text> : null}
              <Text accessibilityLiveRegion="polite" style={styles.meta}>{draftError ? 'Проверьте даты' : periodSummary(candidate)}. Конечный день включён полностью.</Text>
              <Button title="Применить" disabled={disabled || Boolean(draftError)} onPress={() => { if (!draftError) apply(candidate) }} />
              <Button title="Отмена" variant="secondary" onPress={close} />
            </>}
          </ScrollView>
        </View>
      </KeyboardAvoidingView> : null}
    </Modal>
  </View>
}
const createStyles = (p: Palette) => StyleSheet.create({
  wrap: { gap: 4, flexShrink: 1, flexGrow: 1, minWidth: 160, maxWidth: '100%' }, label: { fontFamily: typography.fontFamily, color: p.generalText, fontSize: 12, fontWeight: '600' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, field: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, borderColor: p.border, backgroundColor: p.surface },
  value: { flex: 1, flexShrink: 1, fontFamily: typography.fontFamily, fontSize: 14, color: p.secondaryText }, reset: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.secondaryBorder, backgroundColor: p.secondaryBackground },
  focused: { borderColor: p.primary }, disabled: { opacity: 0.65 }, layer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.overlayBackdrop },
  panel: { flexShrink: 1, borderWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: p.border, backgroundColor: p.periodBackground, elevation: 12, overflow: 'hidden' }, scroll: { flexShrink: 1 }, content: { padding: 12, gap: 10 },
  headingRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12 }, heading: { flex: 1, fontFamily: typography.fontFamily, color: p.periodForeground, fontSize: 16, fontWeight: '600' }, iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, month: { flex: 1, textAlign: 'center', fontFamily: typography.fontFamily, color: p.periodForeground, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.285714%', textAlign: 'center', color: p.cardMuted, fontFamily: typography.fontFamily, fontSize: 11 },
  day: { width: '14.285714%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 4, borderWidth: 1, borderColor: 'transparent' }, dayText: { fontFamily: typography.fontFamily, color: p.periodForeground, fontSize: 12 }, selected: { backgroundColor: p.primary }, endpoint: { borderColor: p.text }, selectedText: { color: p.onPrimary }, active: { position: 'absolute', bottom: 0, color: p.generalText, fontSize: 14 },
  meta: { fontFamily: typography.fontFamily, color: p.cardMuted, fontSize: 12, lineHeight: 18 }, error: { fontFamily: typography.fontFamily, color: p.notice.danger.text, fontSize: 12 },
})
