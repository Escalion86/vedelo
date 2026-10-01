import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useNetInfo } from '@react-native-community/netinfo'
import { useQueryClient } from '@tanstack/react-query'
import type { Client, Event, Service, Transaction } from '../../src/shared/domain/types'
import { eventPlainText } from '../../src/shared/domain/eventForm'
import { saveLocalEntity } from '../../src/shared/storage/mutations'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import { useWorkItemTerminology } from '../../src/shared/hooks/useWorkItemTerminology'
import { Button, EmptyState, Notice, PageHeader, Screen, SectionTitle, StatusChip, Surface } from '../../src/shared/ui/components'
import { QuickContacts, openContactUrl } from '../../src/shared/ui/QuickContacts'
import { useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import type { Palette } from '../../src/shared/ui/theme'
import { buildEventNavigationLinks, formatEventAddress } from '../../src/features/events/navigation'
import { eventPublicApiSource, isEventImportChecked } from '../../src/features/events/filters'
import { getEventCardClientName, getEventCardStatus, getEventCardStatusKey } from '../../src/features/events/eventCard'
import { detailDate, eventDuration, getEventDetailFinance } from '../../src/features/events/eventDetail'
import { EventFinanceSummary } from '../../src/features/events/EventFinanceSummary'
import { editEventSection, EventDetailActions } from '../../src/features/events/EventDetailActions'

export default function EventDetailScreen() {
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const { id } = useLocalSearchParams<{ id: string }>()
  const events = useCachedEntities<Event>('events')
  const clients = useCachedEntities<Client>('clients')
  const services = useCachedEntities<Service>('services')
  const transactions = useCachedEntities<Transaction>('transactions')
  const queryClient = useQueryClient()
  const network = useNetInfo()
  const online = network.isConnected === true && network.isInternetReachable !== false
  const [taskError, setTaskError] = useState('')
  const [taskBusy, setTaskBusy] = useState(false)
  const mutationBusy = useRef(false)
  const { refetch: refreshEvents } = events, { refetch: refreshClients } = clients,
    { refetch: refreshServices } = services, { refetch: refreshTransactions } = transactions
  useFocusEffect(useCallback(() => {
    void Promise.all([refreshEvents(), refreshClients(), refreshServices(), refreshTransactions()])
  }, [refreshEvents, refreshClients, refreshServices, refreshTransactions]))
  const event = events.data?.find((item) => item._id === id)
  if (events.isPending) return <Screen><PageHeader title={terms.labelCapitalized} /><ActivityIndicator accessibilityLabel="Загрузка работы" /></Screen>
  if (events.isError) return <Screen><PageHeader title={terms.labelCapitalized} /><Notice tone="danger" message="Не удалось прочитать работу" /><Button title="Повторить" onPress={() => void events.refetch()} /></Screen>
  if (!event) return <Screen><PageHeader title={terms.labelCapitalized} /><EmptyState title="Запись не найдена" description="Возможно, она удалена или ещё не загружена на устройство." /><Button title={`К списку ${terms.pluralGenitive}`} onPress={() => router.replace('/(tabs)/events')} /></Screen>
  const status = getEventCardStatus(event)
  const finance = getEventDetailFinance(event, transactions.data || [])
  const relatedServices = services.data?.filter((service) => event.servicesIds?.includes(service._id)) || []
  const source = eventPublicApiSource(event)
  const address = formatEventAddress(event.address)
  const links = buildEventNavigationLinks(event.address)
  const duration = eventDuration(event)
  const contactRows = [
    { clientId: event.clientId, comment: 'Основной клиент' }, ...(event.otherContacts || []),
  ]
  const toggleTask = async (index: number) => {
    if (mutationBusy.current) return
    mutationBusy.current = true; setTaskBusy(true); setTaskError('')
    try {
      const tasks = [...(event.additionalEvents || [])], task = tasks[index]
      tasks[index] = { ...task, done: !task.done, doneAt: !task.done ? new Date().toISOString() : null }
      await saveLocalEntity({ entityType: 'events', entityId: event._id, values: { additionalEvents: tasks } })
      await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'events'] })
    } catch { setTaskError('Не удалось сохранить задачу. Попробуйте ещё раз.') }
    finally { mutationBusy.current = false; setTaskBusy(false) }
  }
  const images = (event.images || []).filter((url) => typeof url === 'string' && /^https:\/\//i.test(url))
  return <Screen>
    <PageHeader title={event.eventType || terms.labelCapitalized} />
    {!isEventImportChecked(event) ? <Notice tone="warning" message="Проверьте данные импорта в разделе «Общие»." /> : null}
    {images.length ? <ScrollView horizontal contentContainerStyle={styles.gallery}>{images.map((uri, index) =>
      <View key={`${uri}-${index}`}><Image accessible accessibilityLabel={`Изображение ${index + 1}`} source={{ uri }} style={styles.image} resizeMode="contain" />
        <Text style={styles.muted}>{index + 1} / {images.length}</Text></View>)}</ScrollView> : null}
    {!online ? <Notice message="Без сети показаны сохранённые данные. Изменения отправятся при подключении." /> : null}
    {(event.syncStatus && event.syncStatus !== 'synced') || event._id.startsWith('local-') ? <Notice
      tone={event.syncStatus === 'failed' || event.syncStatus === 'conflict' ? 'warning' : 'info'}
      message={event.syncStatus === 'failed' ? 'Ошибка синхронизации. Проверьте очередь в меню.' : event.syncStatus === 'conflict' ? 'Есть конфликт изменений. Откройте синхронизацию в меню.' : 'Ожидает синхронизации'} /> : null}
    <View style={styles.tags}>
      {event.isTransferred ? <StatusChip label="Передано коллеге" tone="warning" /> : null}
      {event.isByContract ? <StatusChip label="По договору" tone="blue" /> : null}
      {source ? <StatusChip label={source} tone="blue" /> : null}
      {(event.tags || []).filter((tag) => typeof tag === 'string' && tag.trim()).map((tag, index) => <StatusChip key={`${tag}-${index}`} label={tag} />)}
      <EventDetailActions event={event} online={online} />
    </View>
    <Surface testID="event-place-status">
      <Text style={styles.text}>{address || 'Адрес не указан'}</Text>
      <Text style={styles.muted}>Создано: {detailDate(event.createdAt || event.requestCreatedAt)}</Text>
      {event.requestCreatedAt && event.requestCreatedAt !== event.createdAt ? <Text style={styles.muted}>Дата заявки: {detailDate(event.requestCreatedAt)}</Text> : null}
      <StatusChip label={status.label} eventStatus={getEventCardStatusKey(event)} />
    </Surface>
    <Surface testID="event-dates">
      <Text style={styles.text}>Начало: {detailDate(event.eventDate)}</Text>
      <Text style={styles.text}>Окончание: {detailDate(event.dateEnd)}</Text>
      {duration ? <Text style={styles.muted}>Длительность: {duration}</Text> : null}
    </Surface>
    {event.description ? <Surface testID="event-description"><SectionTitle>Описание</SectionTitle><Text style={styles.text}>{eventPlainText(event.description)}</Text></Surface> : null}
    {transactions.isError ? <Notice tone="danger" message="Не удалось прочитать финансы. Итоги недоступны." /> : transactions.isPending ? <ActivityIndicator accessibilityLabel="Загрузка финансов" /> : <>
      {finance.hasObligations ? <Notice tone="warning" message="Есть обязательства. Они не входят в доходы и расходы до смены метода оплаты и указания фактической даты." /> : null}
      <EventFinanceSummary event={event} transactions={transactions.data || []} />
    </>}
    {transactions.isError ? <Button title="Повторить загрузку финансов" onPress={() => void transactions.refetch()} /> : null}
    <Surface testID="event-details"><SectionTitle>Подробности</SectionTitle>
      {services.isError ? <><Notice tone="danger" message="Не удалось прочитать услуги" /><Button title="Повторить загрузку услуг" onPress={() => void services.refetch()} /></>
        : services.isPending ? <Text style={styles.muted}>Загрузка услуг…</Text>
        : relatedServices.length ? relatedServices.map((service) => <View key={service._id}>
          <Text style={styles.text}>{service.title || 'Услуга'}</Text>{service.description ? <Text style={styles.muted}>{eventPlainText(service.description)}</Text> : null}
        </View>) : <Text style={styles.muted}>Услуги не указаны</Text>}
      {event.waitDeposit ? <Text style={styles.text}>Ожидается задаток{event.depositExpectedAmount != null ? `: ${event.depositExpectedAmount} ₽` : ''}{event.depositDueAt ? `, срок: ${detailDate(event.depositDueAt)}` : ''}</Text> : null}
      {event.calendarSyncError ? <Notice tone="warning" message="Не удалось синхронизировать календарь. Проверьте подключение в интеграциях." /> : null}
      <Button title="Изменить общие данные" variant="secondary" onPress={() => editEventSection(event._id, 'general')} />
    </Surface>
    <Surface testID="event-contacts"><SectionTitle>Контакты</SectionTitle>
      {clients.isError ? <><Notice tone="danger" message="Не удалось прочитать контакты" /><Button title="Повторить загрузку контактов" onPress={() => void clients.refetch()} /></>
        : clients.isPending ? <Text style={styles.muted}>Загрузка контактов…</Text> : contactRows.map((contact, index) => {
          const client = clients.data?.find((item) => item._id === contact.clientId)
          return <View key={`${contact.clientId}-${index}`} style={styles.contact}>
            <Text style={styles.text}>{client ? getEventCardClientName(client) : contact.clientId ? 'Контакт недоступен на устройстве' : 'Клиент не указан'}</Text>
            {contact.comment ? <Text style={styles.muted}>{eventPlainText(contact.comment)}</Text> : null}
            <QuickContacts client={client} maxVisible={7} />
            {client ? <Button title="Открыть клиента" variant="secondary" onPress={() => router.push(`/clients/${client._id}` as never)} /> : null}
          </View>
        })}
      <Button title="Изменить контакты" variant="secondary" onPress={() => editEventSection(event._id, 'contacts')} />
    </Surface>
    <Surface testID="event-tasks"><SectionTitle>Следующие контакты</SectionTitle>
      {event.additionalEvents?.length ? event.additionalEvents.map((task, index) => <Pressable key={task._id || index}
        accessibilityRole="checkbox" accessibilityLabel={task.title || 'Задача'} accessibilityState={{ checked: Boolean(task.done), disabled: taskBusy, busy: taskBusy }}
        disabled={taskBusy} onPress={() => void toggleTask(index)} style={styles.task}>
        <Text style={styles.text}>{task.done ? '☑' : '☐'} {task.title || 'Задача'}</Text>
        <Text style={styles.muted}>{task.date ? detailDate(task.date) : 'Без срока'}</Text>
        {task.description ? <Text style={styles.muted}>{eventPlainText(task.description)}</Text> : null}
      </Pressable>) : <Text style={styles.muted}>Нет запланированных контактов.</Text>}
      {taskError ? <Notice tone="danger" message={taskError} /> : null}
      <Button title="Изменить задачи" variant="secondary" onPress={() => editEventSection(event._id, 'contacts')} />
    </Surface>
    <Surface testID="event-navigation"><SectionTitle>Навигация</SectionTitle>
      {links.length ? links.map((link) => <Button key={link.url} title={link.title} variant="secondary" onPress={() => void openContactUrl(link.url)} />)
        : <Text style={styles.muted}>Укажите адрес, чтобы построить маршрут.</Text>}
      <Button title="Документы" variant="secondary" onPress={() => router.push(`/events/${event._id}/documents` as never)} />
    </Surface>
  </Screen>
}
const createStyles = (p: Palette) => StyleSheet.create({
  text: { color: p.text, fontSize: 15, lineHeight: 21 }, muted: { color: p.cardMuted, fontSize: 13, lineHeight: 19 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, gallery: { gap: 12 },
  image: { width: 256, height: 192, backgroundColor: p.kpiBackground, borderRadius: 8 },
  contact: { gap: 8, paddingVertical: 8 }, task: { minHeight: 48, gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderColor: p.border },
})
