import { typography } from '../../shared/ui/theme'
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { Field, Notice } from '../../shared/ui/components'
import { QuickActionsSheet } from '../../shared/ui/QuickContacts'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import { spacing, type Palette } from '../../shared/ui/theme'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { formatEventDateInput, parseEventDateInput } from '../../shared/domain/eventForm'
import type { TaskChange } from '../../shared/domain/taskActions'
import { postponeActions } from './actions'
import type { AttentionItem, Segment } from './selectors'
import { CompactAction } from './AttentionPresentation'

export function TaskCard({ item, segment, busy, onAction }: {
  item: AttentionItem; segment: Segment; busy: boolean
  onAction: (item: AttentionItem, change: TaskChange) => Promise<boolean>
}) {
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [error, setError] = useState('')
  const { task, event } = item
  const edit = () => {
    if (busy) return
    setMenuOpen(false)
    setTitle(task.title || '')
    setDescription(task.description || '')
    setDateInput(formatEventDateInput(task.date))
    setError('')
    setEditing(true)
  }
  const save = async () => {
    if (busy) return
    const date = parseEventDateInput(dateInput)
    if (!title.trim() || date === undefined) {
      setError(!title.trim() ? 'Введите название задачи' : 'Введите дату в формате ГГГГ-ММ-ДД ЧЧ:ММ или оставьте поле пустым')
      return
    }
    if (await onAction(item, { type: 'edit', title, description, date })) setEditing(false)
  }
  const address = [event.address?.town, event.address?.street, event.address?.house,
    event.address?.flat ? `кв. ${event.address.flat}` : ''].filter(Boolean).join(', ')
  const displayDate = task.done ? task.doneAt ?? task.date : task.date
  const openEvent = () => router.push(`/events/${event._id}` as never)
  const remove = () => {
    if (busy) return
    setMenuOpen(false)
    Alert.alert('Удалить задачу?', task.title || 'Следующий контакт', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => void onAction(item, { type: 'delete' }) },
    ])
  }
  return <View testID={`attention-item-${item.key}`} style={[styles.card, task.done && styles.doneCard]}>
    <View style={styles.heading}>
      {item.kind === 'task' ? <Pressable accessibilityRole="button"
        accessibilityLabel={`${task.done ? 'Отменить выполнение задачи' : 'Выполнить задачу'}: ${task.title || 'Задача'}`}
        accessibilityState={{ disabled: busy || editing, busy, selected: Boolean(task.done) }} disabled={busy || editing}
        style={styles.iconTarget} onPress={() => { if (!busy && !editing) void onAction(item, { type: task.done ? 'undo' : 'complete' }) }}>
        <View style={[styles.check, task.done && styles.checked]}>
          {busy ? <ActivityIndicator size="small" color={palette.primary} /> : <MaterialCommunityIcons name="check" size={16}
            color={task.done ? palette.notice.success.text : palette.cardMuted} />}
        </View>
      </Pressable> : null}
      <View style={styles.details}>
        <Text style={[styles.title, task.done && styles.done]}>{`${task.done ? '✓ ' : ''}${task.title || 'Задача'}`}</Text>
        <Text style={styles.meta}>{`${task.done ? 'Выполнено: ' : ''}${displayDate ? new Date(displayDate).toLocaleString('ru-RU') : 'Без срока'}`}</Text>
        {task.description ? <Text style={styles.text}>{task.description}</Text> : null}
      </View>
      {item.kind === 'task' ? <Pressable accessibilityRole="button" accessibilityLabel={`Открыть меню задачи: ${task.title || 'Задача'}`}
        accessibilityState={{ disabled: busy || editing, expanded: menuOpen }} disabled={busy || editing}
        style={styles.iconTarget} onPress={() => { if (!busy && !editing) setMenuOpen(true) }}>
        <View style={styles.menuIcon}><MaterialCommunityIcons name="dots-vertical" size={20} color={palette.primary} /></View>
      </Pressable> : null}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Открыть ${event.eventType || terms.accusative}`}
      onPress={openEvent} style={styles.context}>
      <Text style={styles.link}>{event.eventType || terms.labelCapitalized}{event.eventDate ? ` · ${new Date(event.eventDate).toLocaleString('ru-RU')}` : ' · Дата не назначена'}</Text>
      {address ? <Text style={styles.meta}>{address}</Text> : null}
    </Pressable>
    {item.kind === 'task' ? <>
      {editing ? <View style={styles.editor}>
        <Field label="Название задачи" value={title} onChangeText={setTitle} editable={!busy} />
        <Field label="Комментарий" value={description} onChangeText={setDescription} multiline editable={!busy} />
        <Field label="Срок (ГГГГ-ММ-ДД ЧЧ:ММ)" value={dateInput} onChangeText={setDateInput} editable={!busy} />
        {error ? <Notice tone="danger" message={error} /> : null}
        <View style={styles.actions}>
          <CompactAction title="Сохранить задачу" variant="primary" loading={busy} onPress={() => void save()} />
          <CompactAction title="Отмена" disabled={busy} onPress={() => setEditing(false)} />
        </View>
      </View> : <>
        {!task.done ? <View style={styles.actions}>{postponeActions(segment).map((action) =>
          <CompactAction key={action.days} title={action.title} disabled={busy}
            onPress={() => void onAction(item, { type: 'postpone', days: action.days })} />)}</View> : null}
      </>}
      <QuickActionsSheet title={task.title || 'Задача'} visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <View style={styles.editor}>
          <CompactAction title="Открыть работу" onPress={() => { setMenuOpen(false); openEvent() }} />
          <CompactAction title="Редактировать" variant="warning" disabled={busy} onPress={edit} />
          <CompactAction title="Удалить" variant="danger" disabled={busy} onPress={remove} />
        </View>
      </QuickActionsSheet>
    </> : <CompactAction title="Открыть оплату" onPress={openEvent} />}
  </View>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  card: { borderWidth: 1, borderColor: palette.border, borderRadius: 12, padding: 12, gap: 4, backgroundColor: palette.surface },
  doneCard: { backgroundColor: palette.notice.success.background, borderColor: palette.notice.success.border },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  details: { flex: 1, minWidth: 0, gap: 4 },
  iconTarget: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  checked: { borderColor: palette.notice.success.border, backgroundColor: palette.notice.success.background },
  menuIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: typography.fontFamily, color: palette.cardTitle, fontSize: 14, fontWeight: '600' },
  text: { fontFamily: typography.fontFamily, color: palette.cardMeta, fontSize: 12 },
  meta: { fontFamily: typography.fontFamily, color: palette.cardMuted, fontSize: 12 },
  done: { color: palette.notice.success.text },
  link: { fontFamily: typography.fontFamily, color: palette.primary, fontSize: 12, fontWeight: '600' },
  context: { minHeight: 40, justifyContent: 'center', gap: 4 },
  editor: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
})
