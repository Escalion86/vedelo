import { MaterialCommunityIcons } from '@expo/vector-icons'
import { StyleSheet, Text, View, type ViewProps } from 'react-native'
import { useTheme, useThemeStyles } from './ThemeProvider'
import type { NoticeTone, Palette } from './theme'

const icons = {
  success: 'check-circle-outline', warning: 'alert-outline', danger: 'alert-circle-outline',
  info: 'information-outline', neutral: 'information-outline',
} as const
const labels = { success: 'Успешно', warning: 'Предупреждение', danger: 'Ошибка', info: 'Информация', neutral: 'Примечание' }

export const Notice = ({ tone = 'info', message, style, ...props }: ViewProps & {
  tone?: NoticeTone
  message: string
}) => {
  const { palette } = useTheme()
  const styles = useThemeStyles(createStyles)
  const role = palette.notice[tone]
  return (
    <View
      accessible
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${labels[tone]}: ${message}`}
      {...props}
      style={[styles.container, { backgroundColor: role.background, borderColor: role.border }, style]}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <MaterialCommunityIcons name={icons[tone]} size={20} color={role.text} />
      </View>
      <Text style={[styles.text, { color: role.text }]}>{message}</Text>
    </View>
  )
}

const createStyles = (_palette: Palette) => StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, gap: 8 },
  text: { flex: 1, fontSize: 14, lineHeight: 19.6 },
})
