import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  formatEventDateInput,
  parseEventDateInput,
  serializeEventTasks,
  validateEventDates,
  type EventTaskDraft,
} from '../../../src/shared/domain/eventForm'
import type { Client, Event, MobileSettings, Service } from '../../../src/shared/domain/types'
import { formatPhoneForDisplay } from '../../../src/shared/format/phone'
import { getCachedEntity, listCachedEntities } from '../../../src/shared/storage/cache'
import { deleteLocalEntity, saveLocalEntity } from '../../../src/shared/storage/mutations'
import {
  Button,
  ErrorNotice,
  Field,
  PageHeader,
  Screen,
  SectionTitle,
  Surface,
} from '../../../src/shared/ui/components'
import { colors, radius, spacing } from '../../../src/shared/ui/theme'
import { VoiceDraftSection } from '../../../src/features/events/VoiceDraftSection'
import { applyVoiceDraftFields, type VoiceDraftFields } from '../../../src/features/events/voiceDraft'
import { useWorkItemTerminology } from '../../../src/shared/hooks/useWorkItemTerminology'

type OtherContactDraft = {
  localKey: string
  clientId: string
  comment: string
}

const emptyValues = {
  eventType: '',
  description: '',
  eventDate: '',
  dateEnd: '',
  status: 'draft' as Event['status'],
  clientId: '',
  town: '',
  street: '',
  house: '',
  entrance: '',
  floor: '',
  flat: '',
  addressComment: '',
  contractSum: '',
  waitDeposit: false,
  depositExpectedAmount: '',
  depositDueAt: '',
}

const localKey = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
const clientName = (client: Client) =>
  [client.firstName, client.secondName].filter(Boolean).join(' ') || formatPhoneForDisplay(client.phone) || 'Клиент'

const eventTasksToDrafts = (event: Event, cloning: boolean): EventTaskDraft[] =>
  (event.additionalEvents || []).map((task) => ({
    ...task,
    ...(cloning ? { _id: undefined, done: false, doneAt: null } : {}),
    localKey: localKey('task'),
    dateInput: formatEventDateInput(task.date),
  }))

export default function EventEditScreen() {
  const terms = useWorkItemTerminology()
  const params = useLocalSearchParams<{ id: string; clientId?: string; cloneId?: string }>()
  const isNew = params.id === 'new'
  const isClone = Boolean(params.cloneId)
  const queryClient = useQueryClient()
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [eventTypeOptions, setEventTypeOptions] = useState<string[]>([])
  const [townOptions, setTownOptions] = useState<string[]>([])
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
  const [tasks, setTasks] = useState<EventTaskDraft[]>([])
  const [otherContacts, setOtherContacts] = useState<OtherContactDraft[]>([])
  const [values, setValues] = useState({ ...emptyValues, clientId: params.clientId || '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const sourceId = params.cloneId || (!isNew ? params.id : '')
    Promise.all([
      listCachedEntities<Client>('clients'),
      listCachedEntities<Service>('services'),
      listCachedEntities<MobileSettings>('siteSettings'),
      sourceId ? getCachedEntity<Event>('events', sourceId) : null,
    ]).then(([clientItems, serviceItems, settingsItems, event]) => {
      const settings = settingsItems[0]
      setClients(clientItems)
      setServices(serviceItems.filter((service) => !service.archive))
      setEventTypeOptions(settings?.custom?.eventTypes || [])
      setTownOptions(settings?.towns || [])
      if (!event) {
        if (settings?.defaultTown) setValues((current) => ({ ...current, town: settings.defaultTown || '' }))
        return
      }
      setValues({
        eventType: event.eventType || '',
        description: event.description || '',
        eventDate: formatEventDateInput(event.eventDate),
        dateEnd: formatEventDateInput(event.dateEnd),
        status: isClone ? 'draft' : event.status,
        clientId: params.clientId || event.clientId || '',
        town: event.address?.town || '',
        street: event.address?.street || '',
        house: event.address?.house || '',
        entrance: event.address?.entrance || '',
        floor: event.address?.floor || '',
        flat: event.address?.flat || '',
        addressComment: event.address?.comment || '',
        contractSum: event.contractSum === undefined ? '' : String(event.contractSum),
        waitDeposit: Boolean(event.waitDeposit),
        depositExpectedAmount:
          event.depositExpectedAmount === undefined || event.depositExpectedAmount === null
            ? ''
            : String(event.depositExpectedAmount),
        depositDueAt: formatEventDateInput(event.depositDueAt),
      })
      setSelectedServiceIds(event.servicesIds || [])
      setTasks(eventTasksToDrafts(event, isClone))
      setOtherContacts((event.otherContacts || []).map((contact) => ({
        localKey: localKey('contact'),
        clientId: contact.clientId || '',
        comment: contact.comment || '',
      })))
    }).catch(() => setError(`Не удалось загрузить данные ${terms.genitive}`))
  }, [isClone, isNew, params.clientId, params.cloneId, params.id])

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const toggleService = (serviceId: string) => setSelectedServiceIds((current) =>
    current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId])

  const updateTask = (key: string, patch: Partial<EventTaskDraft>) =>
    setTasks((current) => current.map((task) => task.localKey === key ? { ...task, ...patch } : task))

  const updateOtherContact = (key: string, patch: Partial<OtherContactDraft>) =>
    setOtherContacts((current) => current.map((contact) =>
      contact.localKey === key ? { ...contact, ...patch } : contact))

  const applyVoiceDraft = (draft: VoiceDraftFields) => {
    setValues((current) => applyVoiceDraftFields(
      current,
      draft,
      new Set(clients.map((client) => client._id)),
    ))
  }

  const save = async () => {
    if (!values.eventType.trim() && !values.description.trim()) {
      setError(`Укажите тип или описание ${terms.genitive}`)
      return
    }
    const dateError = validateEventDates({
      eventDate: values.eventDate,
      dateEnd: values.dateEnd,
      depositDueAt: values.waitDeposit ? values.depositDueAt : '',
      tasks,
    })
    if (dateError) {
      setError(dateError)
      return
    }
    const contractSum = values.contractSum.trim() ? Number(values.contractSum) : 0
    const depositExpectedAmount = values.depositExpectedAmount.trim()
      ? Number(values.depositExpectedAmount)
      : null
    if (!Number.isFinite(contractSum) || (depositExpectedAmount !== null && !Number.isFinite(depositExpectedAmount))) {
      setError('Суммы должны быть указаны числами')
      return
    }
    if (otherContacts.some((contact) => !contact.clientId)) {
      setError('Выберите клиента для каждого дополнительного контакта')
      return
    }
    const otherContactIds = otherContacts.map((contact) => contact.clientId)
    if (
      otherContactIds.some((clientId) => clientId === values.clientId) ||
      new Set(otherContactIds).size !== otherContactIds.length
    ) {
      setError('Основной и дополнительные контакты не должны повторяться')
      return
    }

    setLoading(true)
    setError('')
    try {
      const entity = await saveLocalEntity({
        entityType: 'events',
        entityId: isNew || isClone ? undefined : params.id,
        values: {
          eventType: values.eventType.trim(),
          description: values.description.trim(),
          eventDate: parseEventDateInput(values.eventDate) ?? null,
          dateEnd: parseEventDateInput(values.dateEnd) ?? null,
          status: values.status,
          clientId: values.clientId || null,
          servicesIds: selectedServiceIds,
          otherContacts: otherContacts.map(({ clientId, comment }) => ({
            clientId,
            comment: comment.trim(),
          })),
          address: {
            town: values.town.trim(),
            street: values.street.trim(),
            house: values.house.trim(),
            entrance: values.entrance.trim(),
            floor: values.floor.trim(),
            flat: values.flat.trim(),
            comment: values.addressComment.trim(),
          },
          contractSum,
          waitDeposit: values.waitDeposit,
          depositExpectedAmount: values.waitDeposit ? depositExpectedAmount : null,
          depositDueAt: values.waitDeposit
            ? parseEventDateInput(values.depositDueAt) ?? null
            : null,
          additionalEvents: serializeEventTasks(tasks),
        },
      })
      await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'events'] })
      router.replace(`/events/${entity._id}` as never)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить')
    } finally {
      setLoading(false)
    }
  }

  const remove = () => Alert.alert(
    `Удалить ${terms.accusative}?`,
    'Удаление будет синхронизировано со всеми устройствами.',
    [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          await deleteLocalEntity('events', params.id)
          await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'events'] })
          router.replace('/(tabs)/events')
        },
      },
    ],
  )

  return (
    <Screen>
      <PageHeader
        title={isNew || isClone ? 'Новая заявка' : 'Редактирование'}
        subtitle="Изменения можно сохранить без сети"
      />
      <VoiceDraftSection onApply={applyVoiceDraft} />
      <Surface>
        <Field
          testID="event-type"
          label={`Тип ${terms.genitive}`}
          value={values.eventType}
          onChangeText={(value) => set('eventType', value)}
          placeholder="Свадьба, корпоратив…"
        />
        {eventTypeOptions.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>{eventTypeOptions.map((eventType) => <Option key={eventType} label={eventType} selected={values.eventType === eventType} onPress={() => set('eventType', eventType)} />)}</ScrollView> : null}
        <Field
          label="Описание"
          value={values.description}
          onChangeText={(value) => set('description', value)}
          multiline
        />
        <View style={styles.row}>
          <View style={styles.grow}>
            <Field
              label="Начало"
              value={values.eventDate}
              onChangeText={(value) => set('eventDate', value)}
              placeholder="2026-08-15 18:00"
            />
          </View>
          <View style={styles.grow}>
            <Field
              label="Окончание"
              value={values.dateEnd}
              onChangeText={(value) => set('dateEnd', value)}
              placeholder="2026-08-15 22:00"
            />
          </View>
        </View>
        <SectionTitle>Статус</SectionTitle>
        <View style={styles.options}>
          {([['draft', 'Заявка'], ['active', 'Подтверждено'], ['closed', 'Закрыто'], ['canceled', 'Отменено']] as const)
            .map(([value, label]) => (
              <Option key={value} label={label} selected={values.status === value} onPress={() => set('status', value)} />
            ))}
        </View>
        <SectionTitle>Основной клиент</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>
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
        <SectionTitle>Услуги</SectionTitle>
        {services.length ? (
          <View style={styles.options}>
            {services.map((service) => (
              <Option
                key={service._id}
                label={`${service.title || 'Услуга'}${service.price ? ` · ${service.price} ₽` : ''}`}
                selected={selectedServiceIds.includes(service._id)}
                onPress={() => toggleService(service._id)}
              />
            ))}
          </View>
        ) : <Text style={styles.muted}>Нет доступных услуг. Их можно добавить в разделе «Ещё».</Text>}
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>
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
        <SectionTitle>Адрес</SectionTitle>
        <Field label="Город" value={values.town} onChangeText={(value) => set('town', value)} />
        {townOptions.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>{townOptions.map((town) => <Option key={town} label={town} selected={values.town === town} onPress={() => set('town', town)} />)}</ScrollView> : null}
        <View style={styles.row}>
          <View style={styles.grow}>
            <Field label="Улица" value={values.street} onChangeText={(value) => set('street', value)} />
          </View>
          <View style={styles.house}>
            <Field label="Дом" value={values.house} onChangeText={(value) => set('house', value)} />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.grow}><Field label="Подъезд" value={values.entrance} onChangeText={(value) => set('entrance', value)} /></View>
          <View style={styles.grow}><Field label="Этаж" value={values.floor} onChangeText={(value) => set('floor', value)} /></View>
          <View style={styles.grow}><Field label="Офис / квартира" value={values.flat} onChangeText={(value) => set('flat', value)} /></View>
        </View>
        <Field label="Комментарий к адресу" value={values.addressComment} onChangeText={(value) => set('addressComment', value)} placeholder="Вход со двора, парковка…" multiline />
      </Surface>

      <Surface>
        <SectionTitle>Финансы</SectionTitle>
        <Field
          label="Сумма договора"
          value={values.contractSum}
          onChangeText={(value) => set('contractSum', value)}
          keyboardType="numeric"
        />
        <Pressable style={styles.toggle} onPress={() => set('waitDeposit', !values.waitDeposit)}>
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

      {error ? <ErrorNotice message={error} /> : null}
      <Button
        testID="save-event"
        title="Сохранить"
        loadingTitle={
          values.status === 'closed'
            ? `Закрываем ${terms.accusative}...`
            : 'Сохраняем...'
        }
        onPress={save}
        loading={loading}
      />
      {!isNew && !isClone ? (
        <Button
          title={`Удалить ${terms.accusative}`}
          variant="danger"
          onPress={remove}
          disabled={loading}
        />
      ) : null}
    </Screen>
  )
}

const Option = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    style={[styles.option, selected && styles.optionActive]}
    onPress={onPress}
  >
    <Text style={[styles.optionText, selected && styles.optionTextActive]}>{label}</Text>
  </Pressable>
)

const AddButton = ({ title, onPress }: { title: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" style={styles.addButton} onPress={onPress}>
    <MaterialCommunityIcons name="plus" size={20} color={colors.primary} />
    <Text style={styles.addButtonText}>{title}</Text>
  </Pressable>
)

const RemoveButton = ({ onPress }: { onPress: () => void }) => (
  <Pressable accessibilityRole="button" accessibilityLabel="Удалить" style={styles.removeButton} onPress={onPress}>
    <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.danger} />
  </Pressable>
)

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  horizontalOptions: { gap: 6, paddingRight: spacing.md },
  option: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  optionActive: { backgroundColor: colors.primary },
  optionText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  optionTextActive: { color: '#fff' },
  row: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  house: { width: 92 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
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
  check: { color: '#fff', fontWeight: '800' },
  toggleText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  nestedCard: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
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
