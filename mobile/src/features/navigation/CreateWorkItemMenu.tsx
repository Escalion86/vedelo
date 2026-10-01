import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { Text, StyleSheet } from 'react-native'
import { useAiDraftAccess } from '../events/useAiDraftAccess'
import type { CreateWorkItemChoice } from '../events/createOptions'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { MenuRow } from './MenuRow'

export function CreateWorkItemMenu({ onSelect }: { onSelect: (choice: CreateWorkItemChoice) => void }) {
  const terms = useWorkItemTerminology()
  const access = useAiDraftAccess()
  const styles = useThemeStyles(createStyles)
  return <>
    <Text accessibilityRole="header" style={styles.heading}>Создать {terms.accusative}</Text>
    <MenuRow title="Заявка" icon="file-document-edit-outline" onPress={() => onSelect('draft')} />
    <MenuRow title="Подтверждено" icon="calendar-check-outline" onPress={() => onSelect('active')} />
    {access.allowAi ? <>
      <MenuRow title="Голосом" icon="microphone-outline" disabled={!access.online} onPress={() => onSelect('voice')} />
      <MenuRow title="Свободным текстом" icon="text-box-edit-outline" disabled={!access.online} onPress={() => onSelect('text')} />
      {!access.online ? <Text style={styles.hint}>Для ИИ нужен интернет. Ручное создание доступно.</Text> : null}
    </> : null}
    {access.loading ? <Text style={styles.hint}>Проверяем доступ к ИИ…</Text> : null}
    {access.error ? <Text style={styles.hint}>{access.error}</Text> : null}
  </>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  heading: { color: palette.cardTitle, fontSize: 14, fontWeight: '600', padding: 12 },
  hint: { color: palette.cardMuted, fontSize: 12, lineHeight: 18, padding: 12 },
})
