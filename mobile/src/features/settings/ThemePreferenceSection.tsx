import { Pressable, StyleSheet, Text } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { Button, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'

const options = [['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Как на устройстве']] as const

export const ThemePreferenceSection = () => {
  const { palette, preference, hydrated, persistenceStatus, setPreference } = useTheme()
  const styles = useThemeStyles(createStyles)
  return <Surface>
    <SectionTitle>Тема приложения</SectionTitle>
    <Text style={styles.hint}>Настройка только для этого устройства. Работает без сети и не меняет настройки организации.</Text>
    {!hydrated ? <Notice message="Читаем тему этого устройства… Вы можете выбрать тему сейчас." /> : null}
    {options.map(([value, title]) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={title}
      accessibilityState={{ checked: preference === value }} onPress={() => void setPreference(value)}
      style={({ pressed }) => [styles.option, preference === value && styles.selected, pressed && styles.pressed]}>
      <Text style={styles.title}>{title}</Text>
      <MaterialCommunityIcons name={preference === value ? 'radiobox-marked' : 'radiobox-blank'} size={24}
        color={preference === value ? palette.primary : palette.cardMuted} />
    </Pressable>)}
    {persistenceStatus === 'saving' ? <Notice message="Сохраняем тему на устройстве…" /> : null}
    {persistenceStatus === 'saved' ? <Notice tone="success" message="Тема сохранена на этом устройстве." /> : null}
    {persistenceStatus === 'error' ? <>
      <Notice tone="warning" message="Не удалось прочитать или сохранить тему на устройстве. Текущая тема применяется, но её сохранение после перезапуска не подтверждено." />
      <Button title="Повторить сохранение темы" variant="secondary" onPress={() => void setPreference(preference)} />
    </> : null}
  </Surface>
}

const createStyles = (palette: Palette) => StyleSheet.create({
  hint: { color: palette.cardMuted, fontSize: 13, lineHeight: 18 },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8,
    borderRadius: 4, borderWidth: 1, borderColor: palette.border },
  title: { flex: 1, minWidth: 0, color: palette.text, fontSize: 14, fontWeight: '600' },
  selected: { borderColor: palette.primary, backgroundColor: palette.rowSelected },
  pressed: { backgroundColor: palette.rowPressed },
})
