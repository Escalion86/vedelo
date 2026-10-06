import { ActivityIndicator } from 'react-native'
import { Button, ErrorNotice, Notice } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import type { ResultNotice } from './useIntegrationSession'
export function IntegrationFormState({ loading, error, notice, needsRead, working, onRead }: {
  loading: boolean; error: string; notice: ResultNotice | null; needsRead: boolean; working: boolean; onRead: () => void
}) {
  const { palette } = useTheme()
  return <>
    {loading ? <ActivityIndicator accessibilityLabel="Загрузка состояния интеграции" color={palette.primary} /> : null}
    {error ? <ErrorNotice message={error} /> : null}
    {notice ? <Notice {...notice} /> : null}
    {error || needsRead ? <Button title="Повторить чтение состояния" variant="secondary" disabled={working || loading} onPress={onRead} /> : null}
  </>
}
