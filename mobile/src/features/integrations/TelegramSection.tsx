import { StyleSheet, Text } from 'react-native'
import { Notice, SectionTitle, StatusChip, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { statusPresentation, type ProviderStatus } from './integrationContract'
// Summary is the only complete safe mobile contract. Connect/status web routes
// accept bearer, but disconnect does not. Do not expose a partial mutation flow.
export function TelegramSection({ state }: { state?: ProviderStatus }) {
  const styles = useThemeStyles(createStyles)
  return <Surface>
    <SectionTitle>Telegram Business</SectionTitle>
    <StatusChip {...statusPresentation(state)} />
    {state?.botUsername ? <Text style={styles.text}>Бот: @{state.botUsername}</Text> : null}
    {!state ? <Notice tone="warning" message="Статус Telegram Business не получен. Обновите список интеграций." /> : null}
    <Notice tone="info" message="В Android доступен только просмотр состояния Telegram Business. Полное управление через мобильную авторизацию пока не поддерживается." />
  </Surface>
}
const createStyles = (palette: Palette) => StyleSheet.create({ text: { color: palette.text, fontSize: 13, lineHeight: 18 } })
