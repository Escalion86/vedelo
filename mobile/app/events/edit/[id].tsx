import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { createEventDraft, EVENT_SECTIONS, eventSection, serializeEventDraft, type EventDraft, type EventFormValues, type EventTaskDraft, type OtherContactDraft } from '../../../src/shared/domain/eventForm'
import type { Client, Event, MobileSettings, Service } from '../../../src/shared/domain/types'
import { formatPhoneForDisplay } from '../../../src/shared/format/phone'
import { getCachedEntity, listCachedEntities } from '../../../src/shared/storage/cache'
import { deleteLocalEntity, saveLocalEntity } from '../../../src/shared/storage/mutations'
import { Button, ErrorNotice, Field, PageHeader, Screen, SectionTitle, Surface } from '../../../src/shared/ui/components'
import { radius, spacing, type Palette } from '../../../src/shared/ui/theme'
import { useTheme, useThemeStyles } from '../../../src/shared/ui/ThemeProvider'
import { EventGeneralSection, GeneralChoice as Option } from '../../../src/features/events/EventGeneralSection'
import { VoiceDraftSection } from '../../../src/features/events/VoiceDraftSection'
import { applyVoiceDraftFields, type VoiceDraftFields } from '../../../src/features/events/voiceDraft'
import { useWorkItemTerminology } from '../../../src/shared/hooks/useWorkItemTerminology'
import { initialWorkItemMode, initialWorkItemStatus } from '../../../src/features/events/createOptions'

const localKey = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
const clientName = (client: Client) => [client.firstName, client.secondName].filter(Boolean).join(' ') || formatPhoneForDisplay(client.phone) || 'Клиент'

export default function EventEditScreen() {
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const params = useLocalSearchParams<{ id: string; clientId?: string; cloneId?: string; initialStatus?: string | string[]; mode?: string | string[]; section?: string | string[] }>()
  // Freeze the entry context: URL updates and tab switches must not rehydrate a dirty form.
  const [entry] = useState(params)
  const isNew = entry.id === 'new', isClone = Boolean(entry.cloneId)
  const queryClient = useQueryClient()
  const navigation = useNavigation()
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [settings, setSettings] = useState<MobileSettings>()
  const [draft, setDraft] = useState<EventDraft>(() => {
    const initial = createEventDraft()
    initial.values.clientId = entry.clientId || ''
    initial.values.status = isNew && !isClone ? initialWorkItemStatus(entry.initialStatus) : 'draft'
    return initial
  })
  const [section, setSection] = useState(() => eventSection(entry.section))
  const [initialMode] = useState(() => isNew && !isClone ? initialWorkItemMode(entry.mode) : 'manual')
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [savedPath, setSavedPath] = useState('')
  const busy = useRef(false)
  const { values, tasks, otherContacts } = draft
  const changeDraft = (next: EventDraft) => { setDirty(true); setDraft(next) }
  const setValues = (update: (current: EventFormValues) => EventFormValues) => {
    setDirty(true); setDraft((current) => ({ ...current, values: update(current.values) }))
  }
  const setTasks = (update: (current: EventTaskDraft[]) => EventTaskDraft[]) => {
    setDirty(true); setDraft((current) => ({ ...current, tasks: update(current.tasks) }))
  }
  const setOtherContacts = (update: (current: OtherContactDraft[]) => OtherContactDraft[]) => {
    setDirty(true); setDraft((current) => ({ ...current, otherContacts: update(current.otherContacts) }))
  }
  usePreventRemove((dirty || loading) && !savedPath, ({ data }) => {
    if (busy.current) return
    Alert.alert('Есть несохранённые изменения', 'Остаться в редакторе или выйти без сохранения?', [
      { text: 'Продолжить редактирование', style: 'cancel' },
      { text: 'Выйти без сохранения', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  })
  useEffect(() => { if (savedPath) router.replace(savedPath as never) }, [savedPath])
  useEffect(() => {
    let active = true
    const sourceId = entry.cloneId || (!isNew ? entry.id : '')
    setError('')
    Promise.all([listCachedEntities<Client>('clients'), listCachedEntities<Service>('services'),
      listCachedEntities<MobileSettings>('siteSettings'), sourceId ? getCachedEntity<Event>('events', sourceId) : null,
    ]).then(([clientItems, serviceItems, settingsItems, event]) => {
      if (!active) return
      if (sourceId && !event) throw new Error('Запись не найдена в локальных данных')
      setClients(clientItems); setServices(serviceItems); setSettings(settingsItems[0])
      setDraft((current) => {
        const next = event ? createEventDraft(event, isClone) : current
        return { ...next, values: { ...next.values,
          clientId: entry.clientId || next.values.clientId,
          town: event ? next.values.town : settingsItems[0]?.defaultTown || next.values.town,
        } }
      })
      setReady(true)
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить данные') })
    return () => { active = false }
  }, [entry, isClone, isNew, attempt])
  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => setValues((current) => ({ ...current, [key]: value }))
  const updateTask = (key: string, patch: Partial<EventTaskDraft>) => setTasks((current) => current.map((task) => task.localKey === key ? { ...task, ...patch } : task))
  const updateOtherContact = (key: string, patch: Partial<OtherContactDraft>) => setOtherContacts((current) => current.map((contact) => contact.localKey === key ? { ...contact, ...patch } : contact))
  const applyVoiceDraft = (fields: VoiceDraftFields) => setValues((current) => applyVoiceDraftFields(current, fields, new Set(clients.map((client) => client._id))))
  const save = async () => {
    if (!ready || busy.current) return
    setError('')
    try {
      const payload = serializeEventDraft(draft, { clientIds: new Set(clients.map((c) => c._id)), serviceIds: new Set(services.map((s) => s._id)) })
      busy.current = true; setLoading(true)
      const entity = await saveLocalEntity({ entityType: 'events', entityId: isNew || isClone ? undefined : entry.id, values: payload })
      void queryClient.invalidateQueries({ queryKey: ['cached-entities', 'events'] }).catch(() => undefined)
      setSavedPath(`/events/${entity._id}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить') }
    finally { busy.current = false; setLoading(false) }
  }
  const remove = () => Alert.alert(`Удалить ${terms.accusative}?`, 'Удаление будет синхронизировано со всеми устройствами.', [
    { text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: async () => {
      if (busy.current) return
      busy.current = true; setLoading(true)
      try {
        await deleteLocalEntity('events', entry.id)
        void queryClient.invalidateQueries({ queryKey: ['cached-entities', 'events'] }).catch(() => undefined)
        setSavedPath('/(tabs)/events')
      } catch { setError('Не удалось удалить запись. Попробуйте ещё раз') }
      finally { busy.current = false; setLoading(false) }
    } },
  ])
  if (!ready) return <Screen><PageHeader title="Редактирование" />{error ? <><ErrorNotice message={error} /><Button title="Повторить" onPress={() => setAttempt((value) => value + 1)} /></> : <ActivityIndicator accessibilityLabel="Загрузка формы" />}</Screen>
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Screen keyboardShouldPersistTaps="handled">
    <PageHeader title={isNew || isClone ? (values.status === 'draft' ? 'Новая заявка' : `Создать ${terms.accusative}`) : 'Редактирование'} />
    <View style={styles.options}>{EVENT_SECTIONS.map(([key, label]) => <Pressable key={key} testID={`event-section-${key}`}
      accessibilityRole="tab" accessibilityState={{ selected: section === key, disabled: loading }} disabled={loading}
      onPress={() => setSection(key)} style={[styles.option, section === key && styles.optionActive]}>
      <Text style={[styles.optionText, section === key && styles.optionTextActive]}>{label}</Text>
    </Pressable>)}</View>
    <View style={styles.section} pointerEvents={loading ? 'none' : 'auto'}>
      <View style={section !== 'general' && { display: 'none' }} accessibilityElementsHidden={section !== 'general'} importantForAccessibility={section === 'general' ? 'auto' : 'no-hide-descendants'}>
        <VoiceDraftSection onApply={applyVoiceDraft} initialMode={initialMode} />
      </View>
      {section === 'general' ? <EventGeneralSection draft={draft} onChange={changeDraft}
        services={services.filter((service) => !service.archive || draft.serviceIds.includes(service._id))} clients={clients}
        eventTypes={(settings?.custom?.eventTypes || []).filter((value) => typeof value === 'string')}
        towns={(settings?.towns || []).filter((value) => typeof value === 'string')}
        showTransfer={settings?.custom?.showColleagueTransferFields === true || Boolean(draft.source?.isTransferred)} genitive={terms.genitive} /> : null}
      {section === 'contacts' ? <View style={styles.section}>
        <Surface>
        <SectionTitle>Основной клиент</SectionTitle>
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>
          <Option label="Не выбран" selected={!values.clientId} onPress={() => set('clientId', '')} />
          {clients.map((client) => (
            <Option
              key={client._id}
              label={clientName(client)}
              selected={values.clientId === client._id}
              onPress={() => set('clientId', client._id)}
            />
          ))}
        </ScrollView>
        </Surface>
      <Surface>
        <SectionTitle>Дополнительные контакты</SectionTitle>
        {otherContacts.map((contact, index) => {
          const selectedElsewhere = new Set(otherContacts
            .filter((item) => item.localKey !== contact.localKey)
            .map((item) => item.clientId))
          return (
            <View key={contact.localKey} style={styles.nestedCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Контакт {index + 1}</Text>
                <RemoveButton onPress={() => setOtherContacts((current) =>
                  current.filter((item) => item.localKey !== contact.localKey))} />
              </View>
              <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>
                {clients
                  .filter((client) => client._id !== values.clientId && !selectedElsewhere.has(client._id))
                  .map((client) => (
                    <Option
                      key={client._id}
                      label={clientName(client)}
                      selected={contact.clientId === client._id}
                      onPress={() => updateOtherContact(contact.localKey, { clientId: client._id })}
                    />
                  ))}
              </ScrollView>
              <Field
                label="Роль или комментарий"
                value={contact.comment}
                onChangeText={(comment) => updateOtherContact(contact.localKey, { comment })}
                placeholder="Организатор, бухгалтер…"
              />
            </View>
          )
        })}
        <AddButton
          title="Добавить контакт"
          onPress={() => setOtherContacts((current) => [...current, {
            localKey: localKey('contact'),
            clientId: '',
            comment: '',
          }])}
        />
      </Surface>

      <Surface>
        <SectionTitle>Следующие контакты</SectionTitle>
        {tasks.map((task, index) => (
          <View key={task.localKey} style={styles.nestedCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Контакт {index + 1}</Text>
              <RemoveButton onPress={() => setTasks((current) =>
                current.filter((item) => item.localKey !== task.localKey))} />
            </View>
            <Field
              label="Что сделать"
              value={task.title || ''}
              onChangeText={(title) => updateTask(task.localKey, { title })}
              placeholder="Перезвонить клиенту"
            />
            <Field
              label="Когда"
              value={task.dateInput}
              onChangeText={(dateInput) => updateTask(task.localKey, { dateInput })}
              placeholder="2026-07-20 10:00"
            />
            <Field
              label="Комментарий"
              value={task.description || ''}
              onChangeText={(description) => updateTask(task.localKey, { description })}
              multiline
            />
          </View>
        ))}
        <AddButton
          title="Добавить следующий контакт"
          onPress={() => setTasks((current) => [...current, {
            localKey: localKey('task'),
            title: '',
            description: '',
            dateInput: '',
            done: false,
            doneAt: null,
          }])}
        />
      </Surface>

      </View> : null}
      {section === 'finance' ? <View style={styles.section}>
      <Surface>
        <SectionTitle>Финансы</SectionTitle>
        <Field
          label="Сумма договора"
          value={values.contractSum}
          onChangeText={(value) => set('contractSum', value)}
          keyboardType="numeric"
        />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: values.waitDeposit }} style={styles.toggle} onPress={() => set('waitDeposit', !values.waitDeposit)}>
          <View style={[styles.checkbox, values.waitDeposit && styles.checkboxActive]}>
            <Text style={styles.check}>{values.waitDeposit ? '✓' : ''}</Text>
          </View>
          <Text style={styles.toggleText}>Ожидается задаток</Text>
        </Pressable>
        {values.waitDeposit ? (
          <>
            <Field
              label="Ожидаемая сумма"
              value={values.depositExpectedAmount}
              onChangeText={(value) => set('depositExpectedAmount', value)}
              keyboardType="numeric"
            />
            <Field
              label="Срок задатка"
              value={values.depositDueAt}
              onChangeText={(value) => set('depositDueAt', value)}
              placeholder="2026-08-01 12:00"
            />
          </>
        ) : null}
      </Surface>

      </View> : null}
    </View>
    {error ? <ErrorNotice message={error} /> : null}
    <Button testID="save-event" title="Сохранить" loadingTitle="Сохраняем…" onPress={save} loading={loading} />
    {!isNew && !isClone ? <Button title={`Удалить ${terms.accusative}`} variant="danger" onPress={remove} disabled={loading} /> : null}
  </Screen></KeyboardAvoidingView>
}
const AddButton = ({ title, onPress }: { title: string; onPress: () => void }) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  return <Pressable accessibilityRole="button" style={styles.addButton} onPress={onPress}>
    <MaterialCommunityIcons name="plus" size={20} color={palette.primary} /><Text style={styles.addButtonText}>{title}</Text>
  </Pressable>
}
const RemoveButton = ({ onPress }: { onPress: () => void }) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  return <Pressable accessibilityRole="button" accessibilityLabel="Удалить" style={styles.removeButton} onPress={onPress}>
    <MaterialCommunityIcons name="trash-can-outline" size={20} color={palette.notice.danger.text} />
  </Pressable>
}
const createStyles = (colors: Palette) => StyleSheet.create({
  section: { gap: spacing.md },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  horizontalOptions: { gap: 6, paddingRight: spacing.md },
  option: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.kpiBackground,
  },
  optionActive: { backgroundColor: colors.primary },
  optionText: { color: colors.cardMuted, fontSize: 12, fontWeight: '700' },
  optionTextActive: { color: colors.onPrimary },
  toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  check: { color: colors.onPrimary, fontWeight: '800' },
  toggleText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  nestedCard: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.kpiBackground,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  removeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  addButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  addButtonText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
})
