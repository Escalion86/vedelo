import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { Client } from '../../shared/domain/types'
import type { EventDraft, EventTaskDraft, OtherContactDraft } from '../../shared/domain/eventForm'
import { Field, SectionTitle, Surface } from '../../shared/ui/components'
import { QuickContacts } from '../../shared/ui/QuickContacts'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { ClientPickerField } from './ClientPickerField'

const localKey = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export type EventContactsSectionProps = {
  draft: EventDraft
  onChange: (draft: EventDraft) => void
  clients: Client[]
  onCreateClient: () => void
  onOpenClient: (clientId: string) => void
}

/** P: клиент и контакты — только локальный черновик, мутации делает редактор через outbox. */
export const EventContactsSection = ({ draft, onChange, clients, onCreateClient, onOpenClient }: EventContactsSectionProps) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const [showDone, setShowDone] = useState(false)
  const v = draft.values
  const selectedClient = clients.find((client) => client._id === v.clientId)
  const contactIds = draft.otherContacts.map((contact) => contact.clientId).filter(Boolean)
  const hasDone = draft.tasks.some((task) => task.done)
  const visibleTasks = draft.tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => showDone || !task.done)

  const replaceTask = (target: EventTaskDraft, patch: Partial<EventTaskDraft>) =>
    onChange({ ...draft, tasks: draft.tasks.map((task) => task.localKey === target.localKey ? { ...task, ...patch } : task) })
  const replaceContact = (target: OtherContactDraft, patch: Partial<OtherContactDraft>) =>
    onChange({
      ...draft,
      otherContacts: draft.otherContacts.map((contact) => contact.localKey === target.localKey ? { ...contact, ...patch } : contact),
    })

  const removeTask = (target: EventTaskDraft) => {
    const remove = () => onChange({ ...draft, tasks: draft.tasks.filter((task) => task.localKey !== target.localKey) })
    if (!target._id) {
      remove()
      return
    }
    Alert.alert('Удалить задачу?', 'Сохранённая задача будет удалена вместе со следующим сохранением работы.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: remove },
    ])
  }

  return (
    <View style={styles.section}>
      <Surface>
        <SectionTitle>Основной клиент</SectionTitle>
        <ClientPickerField
          allowEmpty
          clients={clients}
          excludeIds={contactIds}
          label="Клиент"
          onChange={(clientId) => onChange({ ...draft, values: { ...v, clientId } })}
          onEdit={onOpenClient}
          testID="event-main-client"
          value={v.clientId}
        />
        {selectedClient ? <QuickContacts client={selectedClient} maxVisible={8} /> : null}
        {!v.clientId ? (
          <Pressable accessibilityRole="button" onPress={onCreateClient} style={styles.createLink}>
            <MaterialCommunityIcons name="account-plus-outline" size={18} color={palette.primary} />
            <Text style={styles.createText}>Новый клиент</Text>
          </Pressable>
        ) : null}
      </Surface>

      <Surface>
        <SectionTitle>Дополнительные контакты</SectionTitle>
        {draft.otherContacts.map((contact, index) => {
          const excludeIds = [v.clientId, ...draft.otherContacts
            .filter((item) => item.localKey !== contact.localKey)
            .map((item) => item.clientId)]
            .filter((id): id is string => Boolean(id))
          return (
            <View key={contact.localKey} style={styles.card} testID={`event-other-contact-${index}`}>
              <ClientPickerField
                clients={clients}
                excludeIds={excludeIds}
                label={`Контакт ${index + 1}`}
                onChange={(clientId) => replaceContact(contact, { clientId })}
                onEdit={onOpenClient}
                testID={`event-other-contact-${index}`}
                value={contact.clientId}
              />
              <Field
                label="Кем является"
                onChangeText={(comment) => replaceContact(contact, { comment })}
                placeholder="Организатор, бухгалтер…"
                testID={`event-other-contact-${index}-comment`}
                value={contact.comment}
              />
              <Pressable
                accessibilityLabel="Удалить контакт"
                accessibilityRole="button"
                onPress={() => onChange({ ...draft, otherContacts: draft.otherContacts.filter((item) => item.localKey !== contact.localKey) })}
                style={styles.removeLink}
                testID={`event-other-contact-${index}-remove`}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={palette.notice.danger.text} />
                <Text style={styles.removeText}>Удалить контакт</Text>
              </Pressable>
            </View>
          )
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange({
            ...draft,
            otherContacts: [...draft.otherContacts, { localKey: localKey('contact'), clientId: '', comment: '' }],
          })}
          style={styles.addLink}
        >
          <MaterialCommunityIcons name="plus" size={18} color={palette.primary} />
          <Text style={styles.addText}>Добавить контакт</Text>
        </Pressable>
      </Surface>

      <Surface>
        <SectionTitle>Задачи/События</SectionTitle>
        {hasDone ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: showDone }}
            onPress={() => setShowDone((current) => !current)}
            style={styles.toggle}
          >
            <MaterialCommunityIcons name={showDone ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={20} color={showDone ? palette.primary : palette.cardMuted} />
            <Text style={styles.toggleText}>Показывать выполненные</Text>
          </Pressable>
        ) : null}
        {draft.tasks.length > 0 && visibleTasks.length === 0 ? (
          <Text style={styles.muted}>Нет событий для выбранного фильтра</Text>
        ) : null}
        {visibleTasks.map(({ task, index }) => (
          <View key={task.localKey} style={styles.card} testID={`event-task-${index}`}>
            <View style={styles.cardHeader}>
              <Pressable
                accessibilityLabel={task.done ? 'Отметить как не выполнено' : 'Отметить как выполнено'}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: Boolean(task.done) }}
                onPress={() => replaceTask(task, { done: !task.done, doneAt: task.done ? null : new Date().toISOString() })}
                style={styles.iconButton}
                testID={`event-task-${index}-done`}
              >
                <MaterialCommunityIcons
                  name={task.done ? 'check-circle' : 'circle-outline'} size={24}
                  color={task.done ? palette.notice.success.text : palette.cardMuted}
                />
              </Pressable>
              <Text style={styles.cardTitle}>Задача {index + 1}</Text>
              <Pressable
                accessibilityLabel="Удалить задачу"
                accessibilityRole="button"
                onPress={() => removeTask(task)}
                style={styles.removeIcon}
                testID={`event-task-${index}-remove`}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={palette.notice.danger.text} />
              </Pressable>
            </View>
            <Field
              label="Что сделать" onChangeText={(title) => replaceTask(task, { title })}
              placeholder="Перезвонить клиенту" testID={`event-task-${index}-title`} value={task.title || ''}
            />
            <Field
              label="Когда" onChangeText={(dateInput) => replaceTask(task, { dateInput })}
              placeholder="2026-07-20 10:00" testID={`event-task-${index}-date`} value={task.dateInput}
            />
            <Field
              label="Комментарий" multiline onChangeText={(description) => replaceTask(task, { description })}
              testID={`event-task-${index}-comment`} value={task.description || ''}
            />
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange({
            ...draft,
            tasks: [...draft.tasks, {
              localKey: localKey('task'), title: '', description: '', dateInput: '', done: false, doneAt: null,
            }],
          })}
          style={styles.addLink}
        >
          <MaterialCommunityIcons name="plus" size={18} color={palette.primary} />
          <Text style={styles.addText}>Добавить задачу/событие</Text>
        </Pressable>
      </Surface>
    </View>
  )
}

const createStyles = (palette: Palette) => StyleSheet.create({
  section: { gap: 12 },
  card: { borderColor: palette.border, borderRadius: 8, borderWidth: 1, gap: 10, padding: 12 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  cardTitle: { color: palette.text, flex: 1, fontSize: 14, fontWeight: '700' },
  toggle: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 40 },
  toggleText: { color: palette.text, fontSize: 14, fontWeight: '600' },
  muted: { color: palette.cardMuted, fontSize: 14 },
  iconButton: { alignItems: 'center', justifyContent: 'center', minHeight: 40, minWidth: 40 },
  removeIcon: { alignItems: 'center', justifyContent: 'center', minHeight: 40, minWidth: 40 },
  removeLink: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingVertical: 4 },
  removeText: { color: palette.notice.danger.text, fontSize: 14, fontWeight: '600' },
  addLink: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 44 },
  addText: { color: palette.primary, fontSize: 15, fontWeight: '700' },
  createLink: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 44 },
  createText: { color: palette.primary, fontSize: 15, fontWeight: '700' },
})
