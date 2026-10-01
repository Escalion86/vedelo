import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Button, Field, Notice, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import { spacing, type Palette } from '../../shared/ui/theme'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { formatEventDateInput, parseEventDateInput } from '../../shared/domain/eventForm'
import type { TaskChange } from '../../shared/domain/taskActions'
import { postponeActions } from './actions'
import type { AttentionItem, Segment } from './selectors'

export function TaskCard({ item, segment, busy, onAction }: {
  item: AttentionItem; segment: Segment; busy: boolean
  onAction: (item: AttentionItem, change: TaskChange) => Promise<boolean>
}) {
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [error, setError] = useState('')
  const { task, event } = item
  const edit = () => {
    setTitle(task.title || '')
    setDescription(task.description || '')
    setDateInput(formatEventDateInput(task.date))
    setError('')
    setEditing(true)
  }
  const save = async () => {
    const date = parseEventDateInput(dateInput)
    if (!title.trim() || date === undefined) {
      setError(!title.trim() ? 'Введите название задачи' : 'Введите дату в формате ГГГГ-ММ-ДД ЧЧ:ММ или оставьте поле пустым')
      return
    }
    if (await onAction(item, { type: 'edit', title, description, date })) setEditing(false)
  }
  const address = [event.address?.town, event.address?.street, event.address?.house,
    event.address?.flat ? `кв. ${event.address.flat}` : ''].filter(Boolean).join(', ')
  return <Surface testID={`attention-item-${item.key}`}>
    <Text style={[styles.title, task.done && styles.done]}>{task.title || 'Задача'}</Text>
    <Text style={styles.meta}>{task.date ? new Date(task.date).toLocaleString('ru-RU') : 'Без срока'}</Text>
    {task.description ? <Text style={styles.text}>{task.description}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={`Открыть ${event.eventType || terms.accusative}`}
      onPress={() => router.push(`/events/${event._id}` as never)} style={styles.context}>
      <Text style={styles.link}>{event.eventType || terms.labelCapitalized}{event.eventDate ? ` · ${new Date(event.eventDate).toLocaleString('ru-RU')}` : ' · Дата не назначена'}</Text>
      {address ? <Text style={styles.meta}>{address}</Text> : null}
    </Pressable>
    {item.kind === 'task' ? <>
      {editing ? <View style={styles.editor}>
        <Field label="Название задачи" value={title} onChangeText={setTitle} editable={!busy} />
        <Field label="Комментарий" value={description} onChangeText={setDescription} multiline editable={!busy} />
        <Field label="Срок (ГГГГ-ММ-ДД ЧЧ:ММ)" value={dateInput} onChangeText={setDateInput} editable={!busy} />
        {error ? <Notice tone="danger" message={error} /> : null}
        <Button title="Сохранить задачу" loading={busy} onPress={() => void save()} />
        <Button title="Отмена" variant="secondary" disabled={busy} onPress={() => setEditing(false)} />
      </View> : <>
        <Button title={task.done ? 'Отменить выполнение' : 'Выполнено'} loading={busy}
          variant="secondary" onPress={() => void onAction(item, { type: task.done ? 'undo' : 'complete' })} />
        {!task.done ? <View style={styles.actions}>{postponeActions(segment).map((action) =>
          <Button key={action.days} title={action.title} variant="secondary" disabled={busy} style={styles.action}
            onPress={() => void onAction(item, { type: 'postpone', days: action.days })} />)}</View> : null}
        <View style={styles.actions}>
          <Button title="Изменить" variant="secondary" disabled={busy} onPress={edit} style={styles.action} />
          <Button title="Удалить" variant="danger" disabled={busy} style={styles.action} onPress={() => Alert.alert(
            'Удалить задачу?', task.title || 'Следующий контакт', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Удалить', style: 'destructive', onPress: () => void onAction(item, { type: 'delete' }) },
            ])} />
        </View>
      </>}
    </> : <Button title="Открыть оплату" variant="secondary" onPress={() => router.push(`/events/${event._id}` as never)} />}
  </Surface>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  title: { color: palette.cardTitle, fontSize: 16, fontWeight: '700' },
  text: { color: palette.text, fontSize: 14 },
  meta: { color: palette.cardMuted, fontSize: 13 },
  done: { textDecorationLine: 'line-through', color: palette.cardMuted },
  link: { color: palette.primary, fontSize: 14, fontWeight: '600' },
  context: { minHeight: 44, justifyContent: 'center', gap: 4 },
  editor: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 120 },
})
