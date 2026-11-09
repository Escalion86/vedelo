import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import { useQueryClient } from '@tanstack/react-query'
import { createEventDraft, EVENT_SECTIONS, eventSection, formatEventDateInput, parseEventDateInput, serializeEventChanges, validateEventDraft, type EventDraft } from '../../../src/shared/domain/eventForm'
import { consumePendingEventClient } from '../../../src/shared/domain/eventClientHandoff'
import { consumeSharedDraft, readSharedDraft } from '../../../src/shared/native/shareDraft'
import { deviceSession } from '../../../src/shared/native/device'
import type { Client, Event, MobileSettings, Service, Transaction } from '../../../src/shared/domain/types'
import { getCachedEntity, listCachedEntities, upsertEntities } from '../../../src/shared/storage/cache'
import { deleteLocalEntity, saveLocalEntity } from '../../../src/shared/storage/mutations'
import { Button, ErrorNotice, Notice, PageHeader, Screen, Surface } from '../../../src/shared/ui/components'
import { radius, spacing, typography, type Palette } from '../../../src/shared/ui/theme'
import { useTheme, useThemeStyles } from '../../../src/shared/ui/ThemeProvider'
import { EventContactsSection } from '../../../src/features/events/EventContactsSection'
import { EventFinanceSection } from '../../../src/features/events/EventFinanceSection'
import { eventTransactionsFor, hasDepositPaidTransaction } from '../../../src/features/events/eventFinance'
import { EventGeneralSection } from '../../../src/features/events/EventGeneralSection'
import { api } from '../../../src/shared/api/client'
import { PhotoDraftSection, type PhotoDraftMetadata, type PhotoDraftFields } from '../../../src/features/events/PhotoDraftSection'
import { CompactEventForm } from '../../../src/features/events/CompactEventForm'
import { validationSection, type CompactSectionId } from '../../../src/features/events/compactEventFormHelpers'
import { applyPhotoDraft, photoDraftHighlights } from '../../../src/features/events/applyPhotoDraft'
import { useWorkItemTerminology } from '../../../src/shared/hooks/useWorkItemTerminology'
import { initialWorkItemMode, initialWorkItemStatus } from '../../../src/features/events/createOptions'
import { aiReviewError, aiReviewHighlights, discardAiReview, readAiReview, refreshAiReview, saveAiReview, type AiReview } from '../../../src/features/events/aiReview'
import { AiPlanSummary } from '../../../src/features/events/AiPlanSummary'
import { getAuthSessionEpoch } from '../../../src/shared/auth/tokenStore'
import { localDataEpoch } from '../../../src/shared/storage/localEntityCoordination'
import { discardAiCreateReview, readAiCreateReview, saveAiCreatedEvent, type AiCreateReview } from '../../../src/features/events/aiCreateReview'
import { resolveLocalEntityId } from '../../../src/shared/storage/localEntityIds'
import { ConfirmedAiEvent } from '../../../src/features/events/ConfirmedAiForm'

const countEventDocuments = (event?: Event | null) =>
  event ? (event.documents?.length || 0) + (event.documentFiles?.length || 0) : 0

export default function EventEditScreen() {
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const params = useLocalSearchParams<{ id: string; clientId?: string; cloneId?: string; initialStatus?: string | string[]; mode?: string | string[]; section?: string | string[]; decision?: string; shareDraft?: string; aiPlan?: string; aiDraft?: string }>()
  // Freeze the entry context: URL updates and tab switches must not rehydrate a dirty form.
  const [entry] = useState(params)
  const [aiScope] = useState(() => entry.aiPlan || entry.aiDraft ? { epoch: localDataEpoch(), auth: getAuthSessionEpoch() } : null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const aiCurrent = () => alive.current && !!aiScope && aiScope.epoch === localDataEpoch() && aiScope.auth === getAuthSessionEpoch()
  const [aiReview, setAiReview] = useState<AiReview | null>(null)
  const [aiCreate, setAiCreate] = useState<AiCreateReview | null>(null)
  const isNew = entry.id === 'new', isClone = Boolean(entry.cloneId)
  const [sharedDraft] = useState(() => isNew && !isClone && entry.shareDraft ? readSharedDraft(entry.shareDraft, deviceSession()?.generation) : null)
  const redirectAi = isNew && !isClone && !entry.aiDraft && (sharedDraft?.mode === 'text' || !sharedDraft && (entry.mode === 'voice' || entry.mode === 'text'))
  useEffect(() => { if (sharedDraft && !redirectAi) consumeSharedDraft(sharedDraft.id, sharedDraft.generation) }, [sharedDraft, redirectAi])
  useEffect(() => { if (redirectAi) router.replace({ pathname: '/events/assistant', params: { mode: sharedDraft ? 'text' : entry.mode, ...(sharedDraft ? { shareDraft: sharedDraft.id } : {}) } } as never) }, [redirectAi, entry, sharedDraft])
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
    // Keep the supplied text in the ordinary form even if AI is unavailable.
    if (sharedDraft) initial.values.description = sharedDraft.text
    initial.values.status = isNew && !isClone ? initialWorkItemStatus(entry.initialStatus) : 'draft'
    return initial
  })
  const [section, setSection] = useState(() => eventSection(entry.section))
  const [initialMode] = useState(() => sharedDraft?.mode || (isNew && !isClone ? initialWorkItemMode(entry.mode) : 'manual'))
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [photoMetadata, setPhotoMetadata] = useState<PhotoDraftMetadata | null>(null)
  const [aiFields, setAiFields] = useState<Set<string>>(() => new Set())
  const [openSections, setOpenSections] = useState<Set<CompactSectionId>>(() => new Set<CompactSectionId>(sharedDraft || entry.section === 'contacts' ? ['client'] : entry.section === 'finance' ? ['finance'] : []))
  const [invalid, setInvalid] = useState<{ section: CompactSectionId; message: string }>()
  const savedLocalId = useRef('')
  const [dirty, setDirty] = useState(Boolean(sharedDraft))
  const [savedPath, setSavedPath] = useState('')
  const busy = useRef(false)
  const formLocked = !!aiReview?.attempt || !!aiCreate?.eventAttempt
  const { values } = draft
  const formClients = aiReview?.plan.clientPatch
    ? clients.map(client => client._id === aiReview.plan.clientPatch?._id ? { ...client, ...aiReview.plan.clientPatch, _id: client._id } as Client : client)
    : clients
  const compact = settings?.custom?.eventFormVariant !== 'classic'
  const previousValidStart = useRef<string | null>(null)
  const endEdited = useRef(false)
  const onManualEdit = (keys: string[]) => {
    if (keys.length === 1 && keys[0] === 'dateEnd') endEdited.current = true
    setAiFields(current => { const next = new Set(current); keys.forEach(key => next.delete(key)); return next })
    setInvalid(undefined)
  }
  const toggleCompact = (id: CompactSectionId) => setOpenSections(current => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next
  })
  // Транзакции и документы принадлежат уже сохранённой работе, а не новой/клонируемой форме.
  const savedWorkId = isNew || isClone ? '' : entry.id
  const loadSourceId = entry.cloneId || savedWorkId
  const relatedTransactions = eventTransactionsFor(transactions, savedWorkId)
  const changeDraft = (next: EventDraft) => {
    if (next.values.eventDate !== draft.values.eventDate) {
      const previous = parseEventDateInput(draft.values.eventDate) || previousValidStart.current
      const start = parseEventDateInput(next.values.eventDate)
      previousValidStart.current = start === undefined ? previous : start
      if (start && next.values.dateEnd === draft.values.dateEnd) {
        const end = parseEventDateInput(next.values.dateEnd)
        const existingDuration = previous && end ? Date.parse(end) - Date.parse(previous) : 0
        if ((previous && end) || (!next.values.dateEnd && !endEdited.current)) {
          const minutes = Number(settings?.custom?.defaultEventDurationMinutes)
          const duration = existingDuration > 0 ? existingDuration : (minutes > 0 ? minutes : 60) * 60_000
          const dateEnd = formatEventDateInput(new Date(Date.parse(start) + duration).toISOString())
          next = { ...next, values: { ...next.values, dateEnd } }
        }
      }
    }
    setDirty(true)
    setDraft(next)
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
    if (redirectAi) return
    let active = true
    setError('')
    Promise.all([listCachedEntities<Client>('clients'), listCachedEntities<Service>('services'),
      listCachedEntities<MobileSettings>('siteSettings'), loadSourceId ? getCachedEntity<Event>('events', loadSourceId) : null,
      listCachedEntities<Transaction>('transactions').then(
        (items) => ({ items, failed: false }),
        () => ({ items: [] as Transaction[], failed: true }),
      ),
      entry.aiPlan ? readAiReview(entry.aiPlan) : null,
      entry.aiDraft ? readAiCreateReview(entry.aiDraft) : null,
    ]).then(([clientItems, serviceItems, settingsItems, event, transactionResult, review, creation]) => {
      if (!active) return
      if (entry.aiPlan && (!review || review.plan.eventId !== savedWorkId || !aiCurrent())) throw new Error('Проверка изменений недоступна. Откройте помощника заново')
      if (entry.aiDraft && (!creation || !isNew || isClone || !aiCurrent())) throw new Error('Черновик недоступен. Откройте помощника заново')
      if (loadSourceId && !event && !review) throw new Error('Запись не найдена в локальных данных')
      setClients(clientItems); setServices(serviceItems); setSettings(settingsItems[0])
      setTransactions(transactionResult.items); setTransactionsError(transactionResult.failed)
      setClientsError(false)
      setDocumentsCount(isClone ? 0 : countEventDocuments(event))
      setAiReview(review)
      setAiCreate(creation)
      if (review) { setAiFields(aiReviewHighlights(review.plan)); setDirty(true) }
      if (creation) {
        setPhotoMetadata({ sourceText: creation.sourceText, aiFilledFields: creation.aiFilledFields, aiWarnings: creation.aiWarnings })
        setAiFields(photoDraftHighlights(creation.fields, creation.aiFilledFields, new Set(clientItems.map(c => c._id)), new Set(serviceItems.map(s => s._id))))
        setDirty(true); setOpenSections(new Set(['client']))
      }
      setDraft((current) => {
        if (review) return review.attempt?.draft || createEventDraft(review.preview)
        if (creation) {
          if (creation.eventAttempt) return creation.eventAttempt.form
          const base = createEventDraft()
          base.values.town = settingsItems[0]?.defaultTown || ''
          return applyPhotoDraft(base, { ...creation.fields, ...(creation.clientId ? { clientId: creation.clientId } : {}) }, new Set(clientItems.map(c => c._id)), new Set(serviceItems.map(s => s._id)))
        }
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
  }, [entry, isClone, isNew, loadSourceId, attempt, redirectAi])
  // Возврат из клиентского редактора, транзакций и документов: обновляем кэш и перенимаем созданного клиента.
  useFocusEffect(useCallback(() => {
    let active = true
    if (ready) {
      void (async () => {
        const [clientResult, transactionResult, eventResult, creationResult] = await Promise.allSettled([
          listCachedEntities<Client>('clients'),
          listCachedEntities<Transaction>('transactions'),
          savedWorkId ? getCachedEntity<Event>('events', savedWorkId) : Promise.resolve(null),
          entry.aiDraft ? readAiCreateReview(entry.aiDraft) : Promise.resolve(null),
        ])
        if (!active) return
        setClientsError(clientResult.status === 'rejected')
        if (clientResult.status === 'fulfilled') {
          const clientItems = clientResult.value
          setClients(clientItems)
          const pendingId = consumePendingEventClient()
          const pendingClient = pendingId ? await resolveLocalEntityId('clients', pendingId) : null
          if (!active) return
          if (pendingClient && clientItems.some((client) => client._id === pendingClient)) {
            setDirty(true)
            setAiFields(current => { const next = new Set(current); next.delete('clientId'); return next })
            setDraft((current) => ({ ...current, values: { ...current.values, clientId: pendingClient } }))
          }
        }
        if (creationResult.status === 'fulfilled' && creationResult.value) setAiCreate(creationResult.value)
        setTransactionsError(transactionResult.status === 'rejected')
        if (transactionResult.status === 'fulfilled') setTransactions(transactionResult.value)
        if (eventResult.status === 'fulfilled' && eventResult.value) {
          setDocumentsCount(countEventDocuments(eventResult.value))
        }
      })()
    }
    return () => { active = false }
  }, [ready, savedWorkId, section, entry.aiDraft]))
  const applyPhoto = async (fields: PhotoDraftFields, metadata?: PhotoDraftMetadata) => {
    let verifiedClients = clients
    if (typeof fields.clientId === 'string' && !clients.some((client) => client._id === fields.clientId)) {
      // Проверка новой связи повторно через tenant-protected GET, до записи в cache.
      const response = await api.get<{ data: Client }>(`/mobile/v1/clients/${encodeURIComponent(fields.clientId)}`)
      if (!response.data?._id || response.data._id !== fields.clientId) throw new Error('Клиент не найден')
      await upsertEntities('clients', [response.data])
      verifiedClients = [...clients, response.data]
      setClients(verifiedClients)
      void queryClient.invalidateQueries({ queryKey: ['cached-entities', 'clients'] }).catch(() => undefined)
    }
    setDirty(true)
    const clientIds = new Set(verifiedClients.map(client => client._id))
    const serviceIds = new Set(services.map(service => service._id))
    // GET может ждать сеть: применяем к последнему draft, сохраняя несвязанные ручные правки.
    setDraft(current => applyPhotoDraft(current, fields, clientIds, serviceIds))
    setPhotoMetadata(metadata || null)
    setAiFields(photoDraftHighlights(fields, metadata?.aiFilledFields || [], clientIds, serviceIds))
    setInvalid(undefined)
  }
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
      const confirmedPayload = aiCreate?.eventAttempt?.values ?? aiReview?.attempt?.manualChanges
      const validationError = confirmedPayload ? null : validateEventDraft(draft)
      if (validationError) {
        const id = validationSection(validationError)
        setInvalid({ section: id, message: validationError })
        setOpenSections(current => new Set([...current, id]))
        if (!compact) setSection(id === 'client' || id === 'tasks' ? 'contacts' : id === 'finance' ? 'finance' : 'general')
        throw new Error(validationError)
      }
      const payload = confirmedPayload ?? serializeEventChanges(draft, {
        clientIds: new Set(clients.map((c) => c._id)), serviceIds: new Set(services.map((s) => s._id)),
        // При ошибке чтения транзакций сохраняем черновик как есть, без нулевой подмены.
        depositPaid: !transactionsError && hasDepositPaidTransaction(relatedTransactions),
      })
      busy.current = true; setLoading(true)
      if (aiCreate) {
        const saved = await saveAiCreatedEvent(aiCreate._id, payload, draft, aiCurrent)
        if (!aiCurrent()) return
        void queryClient.invalidateQueries({ queryKey: ['cached-entities', 'events'] }).catch(() => undefined)
        setSavedPath(`/events/${saved._id}`); return
      }
      if (aiReview) {
        const saved = await saveAiReview(aiReview._id, draft, payload, aiCurrent)
        if (!aiCurrent()) return
        for (const entityType of ['events', 'clients', 'transactions']) void queryClient.invalidateQueries({ queryKey: ['cached-entities', entityType] }).catch(() => undefined)
        setSavedPath(`/events/${saved._id}`)
        return
      }
      const entity = await saveLocalEntity({ entityType: 'events', entityId: savedLocalId.current || (isNew || isClone ? undefined : entry.id), values: payload,
        baseSnapshot: !isNew && !isClone ? draft.source : undefined })
      void queryClient.invalidateQueries({ queryKey: ['cached-entities', 'events'] }).catch(() => undefined)
      savedLocalId.current = entity._id
      const saved = await getCachedEntity<Event>('events', entity._id)
      if (!saved) throw new Error('Не удалось перечитать сохранённую работу. Повторите сохранение')
      savedLocalId.current = saved._id
      setAiFields(new Set())
      setPhotoMetadata(null)
      setSavedPath(`/events/${saved._id}`)
    } catch (reason) {
      setError(aiReview || aiCreate ? aiReviewError(reason) : reason instanceof Error ? reason.message : 'Не удалось сохранить')
      if (aiCreate && aiCurrent()) {
        const pending = await readAiCreateReview(aiCreate._id).catch(() => null)
        if (aiCurrent() && pending) { setAiCreate(pending); if (pending.eventAttempt) setDraft(pending.eventAttempt.form) }
      }
      if (aiReview && aiCurrent()) {
        const pending = await readAiReview(aiReview._id).catch(() => null)
        if (aiCurrent() && pending) { setAiReview(pending); if (pending.attempt) setDraft(pending.attempt.draft) }
      }
    }
    finally { busy.current = false; setLoading(false) }
  }
  const checkAiReview = async () => {
    if (!aiReview || busy.current || !aiCurrent()) return
    busy.current = true; setLoading(true); setError('')
    try { const pending = await refreshAiReview(aiReview._id, aiCurrent); if (aiCurrent()) setAiReview(pending) }
    catch (reason) { if (aiCurrent()) setError(aiReviewError(reason)) }
    finally { busy.current = false; if (aiCurrent()) setLoading(false) }
  }
  const cancelAiReview = async () => {
    if ((!aiReview && !aiCreate) || busy.current || !aiCurrent()) return
    busy.current = true; setLoading(true); setError('')
    try {
      if (aiCreate) { await discardAiCreateReview(aiCreate._id, aiCurrent); if (aiCurrent()) setSavedPath('/events/assistant') }
      else if (aiReview) { await discardAiReview(aiReview._id, aiCurrent); if (aiCurrent()) setSavedPath(`/events/${aiReview.plan.eventId}`) }
    }
    catch (reason) { if (aiCurrent()) setError(aiReviewError(reason)) }
    finally { busy.current = false; if (aiCurrent()) setLoading(false) }
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
  if (redirectAi || !ready) return <Screen><PageHeader title={redirectAi ? 'Помощник ИИ' : 'Редактирование'} />{error ? <><ErrorNotice message={error} /><Button title="Повторить" onPress={() => setAttempt((value) => value + 1)} /></> : <ActivityIndicator accessibilityLabel="Загрузка формы" color={palette.primary} />}</Screen>
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Screen keyboardShouldPersistTaps="handled">
    <PageHeader title={isNew || isClone ? (values.status === 'draft' ? 'Новая заявка' : `Создать ${terms.accusative}`) : 'Редактирование'} />
    {sharedDraft ? <Notice message="Текст из «Поделиться» перенесён в поле «Описание». Проверьте его перед сохранением." /> : null}
    {aiCreate?.clientDraft && !aiCreate.clientId ? <Surface><Notice message={`Предложен новый клиент: ${aiCreate.clientDraft.firstName}. Он появится в CRM только после сохранения его формы. Можно выбрать существующего клиента ниже.`} /><Button title={aiCreate.clientAttempt ? 'Продолжить сохранение клиента' : 'Проверить нового клиента'} variant="secondary" disabled={loading || formLocked} onPress={() => router.push({ pathname: '/clients/edit/[id]', params: { id: 'new', returnTo: 'event', aiDraft: aiCreate._id } } as never)} /></Surface> : null}
    {aiCreate?.clientAttempt ? <Notice message="Клиент сохраняется отдельно. Отмена этой заявки не удалит сохранённого клиента." /> : null}
    {aiCreate?.eventAttempt ? <Notice message="Создание подтверждено. Повтор продолжит сохранение этой же заявки без повторного ИИ-разбора. Введённая форма сохранена на устройстве." /> : null}
    {aiCreate?.eventAttempt ? <ConfirmedAiEvent draft={aiCreate.eventAttempt.form} clients={clients} services={services} /> : null}
    {aiReview ? <><AiPlanSummary plan={aiReview.plan} started={!!aiReview.attempt} manualChanges={aiReview.attempt?.manualChanges} clients={formClients} services={services} /><Button title="Проверить выполненные действия" variant="secondary" disabled={loading} onPress={() => void checkAiReview()} /></> : null}
    {!compact ? <View style={styles.options}>{EVENT_SECTIONS.map(([key, label]) => <Pressable key={key} testID={`event-section-${key}`}
      accessibilityRole="tab" accessibilityState={{ selected: section === key, disabled: loading }} disabled={loading}
      onPress={() => setSection(key)} style={[styles.option, section === key && styles.optionActive]}>
      <Text style={[styles.optionText, section === key && styles.optionTextActive]}>{label}</Text>
    </Pressable>)}</View> : null}
    {photoMetadata ? <Surface testID="event-photo-source"><Text style={styles.photoSource} selectable>{photoMetadata.sourceText}</Text>
      <Notice tone="warning" message="Поля заполнены ИИ. Проверьте данные по оригиналу перед сохранением." />
      {photoMetadata.aiWarnings.map((warning, index) => <Notice key={index} tone="warning" message={warning} />)}
    </Surface> : null}
    <View style={styles.section} pointerEvents={loading || formLocked ? 'none' : 'auto'} accessibilityElementsHidden={formLocked} importantForAccessibility={formLocked ? 'no-hide-descendants' : 'auto'}>
      <View style={!compact && section !== 'general' ? { display: 'none' } : undefined} accessibilityElementsHidden={!compact && section !== 'general'} importantForAccessibility={compact || section === 'general' ? 'auto' : 'no-hide-descendants'}>
        {aiReview || aiCreate || sharedDraft?.mode === 'manual' ? null : savedWorkId ? <Button title="Изменить с ИИ" variant="secondary" onPress={() => router.push({ pathname: '/events/assistant', params: { eventId: savedWorkId } } as never)} disabled={dirty || savedWorkId.startsWith('local-')} /> : initialMode === 'photo' ? <PhotoDraftSection onApply={applyPhoto} /> : <Button title="Помощник ИИ" variant="secondary" disabled={dirty} onPress={() => router.push('/events/assistant' as never)} />}
      </View>
      {compact ? <CompactEventForm draft={draft} onChange={changeDraft} clients={formClients}
        services={services.filter(service => !service.archive || draft.serviceIds.includes(service._id))}
        eventTypes={(settings?.custom?.eventTypes || []).filter(value => typeof value === 'string')}
        towns={(settings?.towns || []).filter(value => typeof value === 'string')}
        showTransfer={settings?.custom?.showColleagueTransferFields === true || Boolean(draft.source?.isTransferred)} genitive={terms.genitive}
        aiFields={aiFields} onManualEdit={onManualEdit} openSections={openSections} onToggle={toggleCompact} invalid={invalid}
        contacts={{ onCreateClient: () => router.push({ pathname: '/clients/edit/[id]', params: { id: 'new', returnTo: 'event' } } as never),
          onOpenClient: clientId => router.push(`/clients/edit/${clientId}` as never) }}
        finance={{ documentsCount, eventId: savedWorkId, transactions: relatedTransactions, transactionsError,
          onAddTransaction: openNewTransaction, onDeleteTransaction: removeTransaction, onOpenTransaction: openTransaction,
          onOpenDocuments: () => router.push(`/events/${savedWorkId}/documents` as never), onRetryTransactions: () => { void loadTransactions() } }}
      /> : null}
      {!compact && section === 'general' ? <EventGeneralSection draft={draft} onChange={changeDraft} aiFields={aiFields} onManualEdit={onManualEdit}
        services={services.filter((service) => !service.archive || draft.serviceIds.includes(service._id))} clients={formClients}
        eventTypes={(settings?.custom?.eventTypes || []).filter((value) => typeof value === 'string')}
        towns={(settings?.towns || []).filter((value) => typeof value === 'string')}
        showTransfer={settings?.custom?.showColleagueTransferFields === true || Boolean(draft.source?.isTransferred)} genitive={terms.genitive} /> : null}
      {!compact && section === 'contacts' ? <EventContactsSection clients={formClients} draft={draft} onChange={changeDraft} aiFields={aiFields} onManualEdit={onManualEdit}
        onCreateClient={() => router.push({ pathname: '/clients/edit/[id]', params: { id: 'new', returnTo: 'event' } } as never)}
        onOpenClient={(clientId) => router.push(`/clients/edit/${clientId}` as never)} /> : null}
      {!compact && section === 'finance' ? <EventFinanceSection documentsCount={documentsCount} draft={draft} eventId={savedWorkId}
        onChange={changeDraft} aiFields={aiFields} onManualEdit={onManualEdit} onAddTransaction={openNewTransaction} onDeleteTransaction={removeTransaction}
        onOpenDocuments={() => router.push(`/events/${savedWorkId}/documents` as never)} onOpenTransaction={openTransaction}
        onRetryTransactions={() => { void loadTransactions() }} transactions={relatedTransactions}
        transactionsError={transactionsError} /> : null}
    </View>
    {clientsError ? <ErrorNotice message="Не удалось обновить клиентов. Вернитесь к вкладке, чтобы повторить загрузку." /> : null}
    {error ? <ErrorNotice message={error} /> : null}
    <Button testID="save-event" title={formLocked ? 'Продолжить сохранение' : 'Сохранить'} loadingTitle="Сохраняем…" onPress={save} loading={loading} disabled={aiReview?.plan.expired} />
    <Button testID="cancel-event" title={formLocked ? 'Вернуться позже' : 'Отмена'} variant="secondary" onPress={() => (aiReview || aiCreate) && !formLocked ? void cancelAiReview() : router.back()} disabled={loading} />
    {!isNew && !isClone && !aiReview ? <Button title={`Удалить ${terms.accusative}`} variant="danger" onPress={remove} disabled={loading} /> : null}
  </Screen></KeyboardAvoidingView>
}
const createStyles = (colors: Palette) => StyleSheet.create({
  section: { gap: spacing.md },
  photoSource: { fontFamily: typography.fontFamily, color: colors.text, fontSize: 14, lineHeight: 20 },
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
