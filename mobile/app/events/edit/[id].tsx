import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { createEventDraft, EVENT_SECTIONS, eventSection, serializeEventDraft, type EventDraft, type EventFormValues } from '../../../src/shared/domain/eventForm'
import { consumePendingEventClient } from '../../../src/shared/domain/eventClientHandoff'
import type { Client, Event, MobileSettings, Service, Transaction } from '../../../src/shared/domain/types'
import { getCachedEntity, listCachedEntities } from '../../../src/shared/storage/cache'
import { deleteLocalEntity, saveLocalEntity } from '../../../src/shared/storage/mutations'
import { Button, ErrorNotice, PageHeader, Screen } from '../../../src/shared/ui/components'
import { radius, spacing, type Palette } from '../../../src/shared/ui/theme'
import { useTheme, useThemeStyles } from '../../../src/shared/ui/ThemeProvider'
import { EventContactsSection } from '../../../src/features/events/EventContactsSection'
import { EventFinanceSection } from '../../../src/features/events/EventFinanceSection'
import { eventTransactionsFor, hasDepositPaidTransaction } from '../../../src/features/events/eventFinance'
import { EventGeneralSection } from '../../../src/features/events/EventGeneralSection'
import { VoiceDraftSection } from '../../../src/features/events/VoiceDraftSection'
import { applyVoiceDraftFields, type VoiceDraftFields } from '../../../src/features/events/voiceDraft'
import { useWorkItemTerminology } from '../../../src/shared/hooks/useWorkItemTerminology'
import { initialWorkItemMode, initialWorkItemStatus } from '../../../src/features/events/createOptions'

const countEventDocuments = (event?: Event | null) =>
  event ? (event.documents?.length || 0) + (event.documentFiles?.length || 0) : 0

export default function EventEditScreen() {
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const params = useLocalSearchParams<{ id: string; clientId?: string; cloneId?: string; initialStatus?: string | string[]; mode?: string | string[]; section?: string | string[]; decision?: string }>()
  // Freeze the entry context: URL updates and tab switches must not rehydrate a dirty form.
  const [entry] = useState(params)
  const isNew = entry.id === 'new', isClone = Boolean(entry.cloneId)
  const queryClient = useQueryClient()
  const navigation = useNavigation()
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [settings, setSettings] = useState<MobileSettings>()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [transactionsError, setTransactionsError] = useState(false)
  const [clientsError, setClientsError] = useState(false)
  const [documentsCount, setDocumentsCount] = useState(0)
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
  const { values } = draft
  // Транзакции и документы принадлежат уже сохранённой работе, а не новой/клонируемой форме.
  const savedWorkId = isNew || isClone ? '' : entry.id
  const loadSourceId = entry.cloneId || savedWorkId
  const relatedTransactions = eventTransactionsFor(transactions, savedWorkId)
  const changeDraft = (next: EventDraft) => { setDirty(true); setDraft(next) }
  const setValues = (update: (current: EventFormValues) => EventFormValues) => {
    setDirty(true); setDraft((current) => ({ ...current, values: update(current.values) }))
  }
  const loadTransactions = useCallback(async () => {
    try {
      const items = await listCachedEntities<Transaction>('transactions')
      setTransactions(items)
      setTransactionsError(false)
    } catch {
      setTransactionsError(true)
    }
  }, [])
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
    setError('')
    Promise.all([listCachedEntities<Client>('clients'), listCachedEntities<Service>('services'),
      listCachedEntities<MobileSettings>('siteSettings'), loadSourceId ? getCachedEntity<Event>('events', loadSourceId) : null,
      listCachedEntities<Transaction>('transactions').then(
        (items) => ({ items, failed: false }),
        () => ({ items: [] as Transaction[], failed: true }),
      ),
    ]).then(([clientItems, serviceItems, settingsItems, event, transactionResult]) => {
      if (!active) return
      if (loadSourceId && !event) throw new Error('Запись не найдена в локальных данных')
      setClients(clientItems); setServices(serviceItems); setSettings(settingsItems[0])
      setTransactions(transactionResult.items); setTransactionsError(transactionResult.failed)
      setClientsError(false)
      setDocumentsCount(isClone ? 0 : countEventDocuments(event))
      setDraft((current) => {
        const next = event ? createEventDraft(event, isClone) : current
        return { ...next, values: { ...next.values,
          clientId: entry.clientId || next.values.clientId,
          ...(event?.status === 'draft' && !isClone && (entry.decision === 'closed' || entry.decision === 'canceled') ? { status: entry.decision } : {}),
          town: event ? next.values.town : settingsItems[0]?.defaultTown || next.values.town,
        } }
      })
      setReady(true)
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить данные') })
    return () => { active = false }
  }, [entry, isClone, isNew, loadSourceId, attempt])
  // Возврат из клиентского редактора, транзакций и документов: обновляем кэш и перенимаем созданного клиента.
  useFocusEffect(useCallback(() => {
    let active = true
    if (ready) {
      void (async () => {
        const [clientResult, transactionResult, eventResult] = await Promise.allSettled([
          listCachedEntities<Client>('clients'),
          listCachedEntities<Transaction>('transactions'),
          savedWorkId ? getCachedEntity<Event>('events', savedWorkId) : Promise.resolve(null),
        ])
        if (!active) return
        setClientsError(clientResult.status === 'rejected')
        if (clientResult.status === 'fulfilled') {
          const clientItems = clientResult.value
          setClients(clientItems)
          const pendingClient = consumePendingEventClient()
          if (pendingClient && clientItems.some((client) => client._id === pendingClient)) {
            setDirty(true)
            setDraft((current) => ({ ...current, values: { ...current.values, clientId: pendingClient } }))
          }
        }
        setTransactionsError(transactionResult.status === 'rejected')
        if (transactionResult.status === 'fulfilled') setTransactions(transactionResult.value)
        if (eventResult.status === 'fulfilled' && eventResult.value) {
          setDocumentsCount(countEventDocuments(eventResult.value))
        }
      })()
    }
    return () => { active = false }
  }, [ready, savedWorkId, section]))
  const applyVoiceDraft = (fields: VoiceDraftFields) => setValues((current) => applyVoiceDraftFields(current, fields, new Set(clients.map((client) => client._id))))
  const openNewTransaction = () => router.push({
    pathname: '/finance/edit/new', params: { eventId: savedWorkId, returnTo: 'event' },
  } as never)
  const openTransaction = (transactionId: string) => router.push({
    pathname: '/finance/edit/[id]', params: { id: transactionId, eventId: savedWorkId, returnTo: 'event' },
  } as never)
  const removeTransaction = async (transactionId: string) => {
    if (busy.current || !relatedTransactions.some((transaction) => transaction._id === transactionId)) return
    busy.current = true; setLoading(true)
    try {
      await deleteLocalEntity('transactions', transactionId)
      void queryClient.invalidateQueries({ queryKey: ['cached-entities', 'transactions'] }).catch(() => undefined)
      setTransactions((current) => current.filter((transaction) => transaction._id !== transactionId))
    } catch { setError('Не удалось удалить транзакцию. Попробуйте ещё раз') }
    finally { busy.current = false; setLoading(false) }
  }
  const save = async () => {
    if (!ready || busy.current) return
    setError('')
    try {
      const payload = serializeEventDraft(draft, {
        clientIds: new Set(clients.map((c) => c._id)), serviceIds: new Set(services.map((s) => s._id)),
        // При ошибке чтения транзакций сохраняем черновик как есть, без нулевой подмены.
        depositPaid: !transactionsError && hasDepositPaidTransaction(relatedTransactions),
      })
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
  if (!ready) return <Screen><PageHeader title="Редактирование" />{error ? <><ErrorNotice message={error} /><Button title="Повторить" onPress={() => setAttempt((value) => value + 1)} /></> : <ActivityIndicator accessibilityLabel="Загрузка формы" color={palette.primary} />}</Screen>
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
      {section === 'contacts' ? <EventContactsSection clients={clients} draft={draft} onChange={changeDraft}
        onCreateClient={() => router.push({ pathname: '/clients/edit/[id]', params: { id: 'new', returnTo: 'event' } } as never)}
        onOpenClient={(clientId) => router.push(`/clients/edit/${clientId}` as never)} /> : null}
      {section === 'finance' ? <EventFinanceSection documentsCount={documentsCount} draft={draft} eventId={savedWorkId}
        onChange={changeDraft} onAddTransaction={openNewTransaction} onDeleteTransaction={removeTransaction}
        onOpenDocuments={() => router.push(`/events/${savedWorkId}/documents` as never)} onOpenTransaction={openTransaction}
        onRetryTransactions={() => { void loadTransactions() }} transactions={relatedTransactions}
        transactionsError={transactionsError} /> : null}
    </View>
    {clientsError ? <ErrorNotice message="Не удалось обновить клиентов. Вернитесь к вкладке, чтобы повторить загрузку." /> : null}
    {error ? <ErrorNotice message={error} /> : null}
    <Button testID="save-event" title="Сохранить" loadingTitle="Сохраняем…" onPress={save} loading={loading} />
    {!isNew && !isClone ? <Button title={`Удалить ${terms.accusative}`} variant="danger" onPress={remove} disabled={loading} /> : null}
  </Screen></KeyboardAvoidingView>
}
const createStyles = (colors: Palette) => StyleSheet.create({
  section: { gap: spacing.md },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
})
