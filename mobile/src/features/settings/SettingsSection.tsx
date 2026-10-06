import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { resolveMobileWorkItemTerminology, type PrimaryEntityTerminology } from '../../shared/domain/workItemTerminology'
import { Button, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { useSettingsEditor, type SettingsConfig } from './settingsEditor'
import { ThemePreferenceSection } from './ThemePreferenceSection'

export const terminologyConfig: SettingsConfig<PrimaryEntityTerminology> = {
  scope: 'terminology', endpoint: '/mobile/v1/settings/terminology',
  initial: (settings) => settings?.custom?.primaryEntityTerminology === 'orders' || settings?.custom?.primaryEntityTerminology === 'events' ? settings.custom.primaryEntityTerminology : 'auto',
  payload: (primaryEntityTerminology) => ({ primaryEntityTerminology }),
  matches: (settings, value) => settings.custom?.primaryEntityTerminology === value,
}
const options = [
  ['auto', 'Авто — по сфере работы'], ['events', 'Мероприятия'], ['orders', 'Заказы'],
] as const
export const SettingsSection = () => {
  const editor = useSettingsEditor(terminologyConfig)
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const terms = resolveMobileWorkItemTerminology(editor.settings)
  return <>
    <ThemePreferenceSection />
    {editor.reading ? <Notice message="Загружаем настройки…" /> : null}
    {editor.readError ? <><Notice tone="warning" message={editor.readError} /><Button title="Повторить загрузку" variant="secondary" onPress={editor.retry} disabled={editor.saving || editor.reading} /></> : null}
    {editor.offline ? <Notice message="Показана последняя офлайн-копия. Для сохранения требуется сеть." /> : null}
    <Surface>
      <SectionTitle>Как называть основную работу</SectionTitle>
      {editor.ready ? <Text style={styles.muted}>Сейчас в приложении: «{terms.pluralCapitalized}». Авторежим использует выбранную сферу работы.</Text> : null}
      {options.map(([value, title]) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ selected: editor.draft === value, disabled: editor.saving || !editor.ready }} disabled={editor.saving || !editor.ready} onPress={() => editor.change(value)} style={({ pressed }) => [styles.option, editor.draft === value && styles.selected, pressed && styles.pressed, (editor.saving || !editor.ready) && styles.disabled]}>
        <View style={styles.grow}><Text style={styles.title}>{title}</Text></View>
        <MaterialCommunityIcons name={editor.draft === value ? 'radiobox-marked' : 'radiobox-blank'} size={24} color={editor.draft === value ? palette.primary : palette.cardMuted} />
      </Pressable>)}
      {editor.error ? <Notice tone="danger" message={editor.error} /> : null}
      {editor.success ? <Notice tone="success" message={editor.success} /> : null}
      <Button title="Сохранить настройки" onPress={() => void editor.save()} loading={editor.saving} disabled={!editor.ready || editor.reading || !editor.dirty} />
    </Surface>
  </>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  grow: { flex: 1, minWidth: 0 }, muted: { color: palette.cardMuted, fontSize: 13, lineHeight: 18 }, title: { color: palette.text, fontSize: 14, fontWeight: '600' },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 4, borderWidth: 1, borderColor: palette.border },
  selected: { borderColor: palette.primary, backgroundColor: palette.rowSelected }, pressed: { opacity: 0.82 }, disabled: { opacity: 0.65 },
})
