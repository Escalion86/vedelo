import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Button, CompactField, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import { eligible, labels, safeJobProblem, type ImportRecord } from './contract'
import type { ImportController, ImportState } from './ImportController'
export function RecordRow({ record, selected, editable, toggle, open }: { record: ImportRecord; selected: boolean; editable: boolean; toggle: () => void; open: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const { palette } = useTheme()
  return <Surface style={{ padding: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Источник: ${record.title}`} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={{ minHeight: 48, justifyContent: 'center' }}>
      <Text style={{ color: palette.text, fontWeight: '600', flexShrink: 1 }}>{record.title}</Text>
      <Text style={{ color: palette.cardMuted }}>{labels[record.status]}</Text>
    </Pressable>
    {editable && eligible(record) ? <Pressable accessibilityRole="checkbox" accessibilityLabel={`Импортировать: ${record.title}`} accessibilityState={{ checked: selected }} onPress={toggle} style={{ minHeight: 48, justifyContent: 'center', borderWidth: 1, borderColor: palette.border, padding: 8 }}>
      <Text style={{ color: palette.text }}>{selected ? '☑ Выбрано' : '☐ Выбрать запись'}</Text>
    </Pressable> : null}
    {expanded ? <View style={{ gap: 8 }}><Text selectable style={{ color: palette.text }}>{record.source}</Text>
      {record.warnings.map((message, index) => <Notice key={index} tone="warning" message={message} />)}
      {record.error ? <Notice tone="warning" message={safeJobProblem(record.error, record.status === 'needs_attention' ? 'Не определены дата или год. Уточните ответы и общий комментарий, затем рассчитайте оставшиеся записи заново.' : record.status === 'possible_duplicate' ? 'Запись пропущена: у клиента уже есть работа на это время. Проверьте существующую карточку.' : 'Сервер не смог обработать запись. Уточните ответы и проверьте источник перед новым расчётом.')} /> : null}
      {record.eventId && ['created', 'duplicate', 'possible_duplicate'].includes(record.status) ? <Button title="Открыть карточку для проверки" variant="secondary" onPress={open} /> : null}
    </View> : null}
  </Surface>
}
export function ReviewStep({ controller, state }: { controller: ImportController; state: ImportState }) {
  const { palette } = useTheme()
  const a = state.job?.analysis
  if (!a) return null
  const blocked = state.busy || state.denied || state.needsRead
  return <Surface>
    <SectionTitle>Проверка структуры</SectionTitle>
    <Notice message={a.summary} />
    <Text style={{ color: palette.text }}>Правила заполнения: {a.rules}</Text>
    {a.examples.map((example, i) => <Notice key={i} tone="neutral" message={example} />)}
    <Notice message="Исправления задаются ответами и общим комментарием. API не поддерживает редактирование распознанных даты и суммы здесь. После импорта проверьте их в карточке. Неизвестные даты будут отложены; финансовые транзакции не создаются." />
    {a.questions.map((q) => <View key={q.id} style={{ gap: 8 }}>
      <CompactField label={q.question} value={state.draft.answers[q.id] || ''} onChangeText={(text) => controller.setAnswer(q.id, text)} editable={!blocked} maxLength={1000} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[...new Set([...q.options, 'Не знаю'])].map((option) => <Button key={option} title={option} variant="secondary" disabled={blocked} onPress={() => controller.setAnswer(q.id, option)} />)}</View>
    </View>)}
    <CompactField label="Общий комментарий и исправления" value={state.draft.answers.comment || ''} onChangeText={(text) => controller.setAnswer('comment', text)} multiline maxLength={2000} editable={!blocked} />
    <Text style={{ color: palette.text }}>Выбрано записей: {state.draft.selectedIds.length}. Созданные и уже импортированные исключены из повторного запуска.</Text>
    <Button title="Рассчитать импорт выбранных записей" onPress={controller.quote} disabled={blocked} />
    {state.job?.ignored.length ? <Surface><SectionTitle>Пропущенные строки</SectionTitle>{state.job.ignored.map((line) => <Text key={line.id} selectable style={{ color: palette.text }}>{line.section} / {line.id}: {line.text}</Text>)}</Surface> : null}
  </Surface>
}
