import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CompactField, Notice, SectionTitle } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { radius, spacing, type Palette } from '../../shared/ui/theme'
import { resolveMobileWorkItemTerminology } from '../../shared/domain/workItemTerminology'
import { recommendedBuiltInContracts, type BuiltInContractTemplate } from '../documents/builtInTemplates'
import { MAX_ACTIVITY_DESCRIPTION, type ActivityDraft, type ActivityPreset } from './activityProfile'

const terminologyOptions = [
  ['orders', 'Заказы'],
  ['events', 'Мероприятия'],
] as const

export function ActivityFields({ draft, presets, change, disabled, error, terminology, templates = [] }: {
  draft: ActivityDraft
  presets: ActivityPreset[]
  change: (draft: ActivityDraft) => void
  disabled?: boolean
  error?: string
  terminology?: boolean
  templates?: BuiltInContractTemplate[]
}) {
  const styles = useThemeStyles(createStyles)
  const suggestedTerms = resolveMobileWorkItemTerminology({
    _id: '', custom: { onboardingActivityPreset: draft.preset },
  })
  const recommendations = recommendedBuiltInContracts(templates, draft.preset)
  return <>
    <Text style={styles.explanation}>Выберите, чем вы занимаетесь. Это поможет предложить подходящие договоры и название работы в CRM.</Text>
    {presets.map((preset) => <Pressable
      key={preset.key}
      testID={`activity-preset-${preset.key}`}
      accessibilityRole="radio"
      accessibilityLabel={preset.title}
      accessibilityState={{ checked: draft.preset === preset.key, disabled }}
      disabled={disabled}
      onPress={() => change({ ...draft, preset: preset.key })}
      style={({ pressed }) => [styles.option, draft.preset === preset.key && styles.selected, pressed && styles.pressed]}
    >
      <Text style={styles.title}>{preset.title}</Text>
      <Text style={styles.muted}>{preset.description}</Text>
    </Pressable>)}
    {draft.preset === 'other' ? <CompactField
      testID="activity-other-description"
      label="Чем вы занимаетесь? *"
      help="Описание помогает понять, каких специализаций ещё не хватает."
      placeholder="Например, ухаживаю за домашними животными"
      maxLength={MAX_ACTIVITY_DESCRIPTION}
      editable={!disabled}
      value={draft.otherDescription}
      error={error}
      onChangeText={(otherDescription) => change({ ...draft, otherDescription })}
    /> : error ? <Notice tone="danger" message={error} /> : null}
    {terminology && draft.preset ? <>
      <SectionTitle>Как называть работу в CRM</SectionTitle>
      <Text style={styles.muted}>Для этой деятельности предлагаем «{suggestedTerms.plural}».</Text>
      <View style={styles.choices}>
        {terminologyOptions.map(([value, label]) => <Pressable
          key={value}
          testID={`activity-terminology-${value}`}
          accessibilityRole="radio"
          accessibilityLabel={label}
          accessibilityState={{ checked: (draft.terminology || suggestedTerms.mode) === value, disabled }}
          disabled={disabled}
          onPress={() => change({ ...draft, terminology: value })}
          style={({ pressed }) => [styles.option, (draft.terminology || suggestedTerms.mode) === value && styles.selected, pressed && styles.pressed]}
        ><Text style={styles.title}>{label}</Text></Pressable>)}
      </View>
    </> : null}
    {recommendations.length ? <>
      <SectionTitle>Подходящие шаблоны договоров</SectionTitle>
      {recommendations.map((template) => <View key={template.id} style={styles.recommendation}>
        <Text style={styles.title}>{template.name}</Text>
        <Text style={styles.muted}>{template.description}</Text>
      </View>)}
    </> : null}
  </>
}

const createStyles = (palette: Palette) => StyleSheet.create({
  explanation: { color: palette.text, fontSize: 14, lineHeight: 21 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minHeight: 48, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: palette.border },
  selected: { borderColor: palette.primary, backgroundColor: palette.rowSelected },
  pressed: { opacity: 0.82 },
  title: { color: palette.text, fontSize: 14, fontWeight: '600' },
  muted: { color: palette.cardMuted, fontSize: 13, lineHeight: 19 },
  recommendation: { gap: 3 },
})
