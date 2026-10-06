import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import { TRANSACTION_CATEGORIES, formatTransactionDateInput, parseTransactionDateInput } from '../../../src/shared/domain/finance'
import type { Client, Event, Transaction } from '../../../src/shared/domain/types'
import { getCachedEntity, listCachedEntities } from '../../../src/shared/storage/cache'
import { deleteLocalEntity, saveLocalEntity } from '../../../src/shared/storage/mutations'
import { Button, CompactField, EmptyState, ErrorNotice, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../../src/shared/ui/components'
import { useTheme, useThemeStyles } from '../../../src/shared/ui/ThemeProvider'
import type { Palette } from '../../../src/shared/ui/theme'
import { useWorkItemTerminology } from '../../../src/shared/hooks/useWorkItemTerminology'
import { clientName } from '../../../src/features/clients/clientList'
import { FinanceRelationPicker } from '../../../src/features/finance/FinanceRelationPicker'
import { transactionCategory } from '../../../src/features/finance/transactionCard'

const PAYMENT_METHODS = [['transfer', 'Перевод'], ['account', 'Расчётный счёт'], ['cash', 'Наличные'], ['barter', 'Бартер'], ['obligation', 'Обязательство']] as const
const timeInput = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
export default function TransactionEditScreen() {
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const navigation = useNavigation()
  const params = useLocalSearchParams<{ id: string; eventId?: string; clientId?: string; returnTo?: string }>()
  const isNew = params.id === 'new'
  const returnToEvent = params.returnTo === 'event'
  const queryClient = useQueryClient()
  const [clients, setClients] = useState<Client[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [values, setValues] = useState(() => { const now = new Date().toISOString(); return {
    amount: '', type: 'income' as Transaction['type'], category: 'deposit', paymentMethod: 'transfer' as NonNullable<Transaction['paymentMethod']>,
    date: formatTransactionDateInput(now), time: timeInput(now), comment: '', eventId: params.eventId || '', clientId: params.clientId || '',
  } })
  const [source, setSource] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const busy = useRef(false)
  usePreventRemove((dirty || loading) && !saved, ({ data }) => {
    if (busy.current) return
    Alert.alert('Есть несохранённые изменения', 'Остаться в редакторе или выйти без сохранения?', [
      { text: 'Продолжить редактирование', style: 'cancel' }, { text: 'Выйти без сохранения', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ])
  })
  useEffect(() => { if (saved) { if (returnToEvent) router.back(); else router.replace('/(tabs)/finance') } }, [saved, returnToEvent])
  useEffect(() => {
    let active = true
    setReady(false); setLoadError('')
    Promise.all([listCachedEntities<Client>('clients'), listCachedEntities<Event>('events'), !isNew && params.id ? getCachedEntity<Transaction>('transactions', params.id) : null])
      .then(([clientItems, eventItems, transaction]) => {
        if (!active) return
        if (!isNew && !transaction) throw new Error('Транзакция не найдена в локальных данных')
        setClients(clientItems); setEvents(eventItems); setSource(transaction)
        if (transaction) setValues({ amount: String(transaction.amount), type: transaction.type, category: transactionCategory(transaction.category),
          paymentMethod: transaction.paymentMethod || 'transfer', date: formatTransactionDateInput(transaction.date), time: timeInput(transaction.date), comment: transaction.comment || '', eventId: transaction.eventId || '', clientId: transaction.clientId || '' })
        else if (params.eventId) {
          const event = eventItems.find((item) => item._id === params.eventId)
          if (event?.clientId) setValues((current) => ({ ...current, clientId: event.clientId || '' }))
        }
        setReady(true); setDirty(false)
      }).catch((cause) => { if (active) setLoadError(cause instanceof Error ? cause.message : 'Не удалось загрузить данные транзакции') })
    return () => { active = false }
  }, [isNew, params.clientId, params.eventId, params.id, attempt])
  const selectedEvent = useMemo(() => events.find((event) => event._id === values.eventId), [events, values.eventId])
  const sourceEvent = source?.eventId ? events.find((event) => event._id === source.eventId) : null
  const locked = Boolean(source?.eventId && (!sourceEvent || sourceEvent.status !== 'active'))
  const selectedClientId = selectedEvent?.clientId || values.clientId
  const selectedClient = clients.find((client) => client._id === selectedClientId)
  const categories = TRANSACTION_CATEGORIES.filter((category) => category.type === values.type || category.type === 'both')
  const change = (next: Partial<typeof values>) => { if (busy.current || locked) return; setDirty(true); setValues((current) => ({ ...current, ...next })) }
  const selectEvent = (eventId: string) => { const event = events.find((item) => item._id === eventId); change({ eventId, clientId: event?.clientId || values.clientId }) }
  const selectClient = (clientId: string) => change({ clientId, ...(selectedEvent?.clientId && selectedEvent.clientId !== clientId ? { eventId: '' } : {}) })
  const setType = (type: Transaction['type']) => { const next = TRANSACTION_CATEGORIES.filter((item) => item.type === type || item.type === 'both'); change({ type, category: next.some((item) => item.value === values.category) ? values.category : next[0]?.value || 'other' }) }
  const fulfill = source?.paymentMethod === 'obligation' && values.paymentMethod !== 'obligation'
  const save = async () => {
    if (!ready || busy.current || locked) return
    const amount = Number(values.amount.replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) { setError('Введите сумму больше нуля'); return }
    const parsed = parseTransactionDateInput(values.date)
    const clock = values.time.match(/^(\d{2}):(\d{2})$/)
    if (!parsed || !clock || Number(clock[1]) > 23 || Number(clock[2]) > 59) { setError('Введите существующую дату ГГГГ-ММ-ДД и время ЧЧ:ММ'); return }
    if (values.eventId && (!selectedEvent || selectedEvent.status !== 'active')) { setError(`Транзакции можно изменять только у активного ${terms.genitive}`); return }
    if (selectedClientId && !selectedClient) { setError('Связанный клиент не найден. Обновите данные или очистите выбор.'); return }
    const sameDate = source && values.date === formatTransactionDateInput(source.date) && values.time === timeInput(source.date)
    if (fulfill && sameDate) { setError('После исполнения обязательства укажите фактическую дату и время оплаты'); return }
    const dateObject = new Date(parsed); dateObject.setHours(Number(clock[1]), Number(clock[2]), 0, 0)
    const date = sameDate && source?.date ? source.date : dateObject.toISOString()
    busy.current = true; setLoading(true); setError('')
    try {
      if (!isNew && !await getCachedEntity<Transaction>('transactions', params.id)) throw new Error('Транзакция удалена. Изменения не сохранены.')
      await saveLocalEntity({ entityType: 'transactions', entityId: isNew ? undefined : params.id,
        values: { amount, type: values.type, category: values.category, paymentMethod: values.paymentMethod, date, comment: values.comment.trim(), eventId: values.eventId || null, clientId: selectedClientId || null } })
      await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'transactions'] })
      setDirty(false); setSaved(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить') }
    finally { busy.current = false; setLoading(false) }
  }
  const remove = () => Alert.alert('Удалить транзакцию?', '', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: async () => {
    if (busy.current || locked) return
    busy.current = true; setLoading(true); setError('')
    try { await deleteLocalEntity('transactions', params.id); await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'transactions'] }); setDirty(false); setSaved(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось удалить транзакцию') }
    finally { busy.current = false; setLoading(false) }
  } }])
  const menu = () => Alert.alert('Действия', '', [{ text: 'История действий', onPress: () => router.push({ pathname: '/history', params: { entityType: 'transaction', entityId: params.id } } as never) }, { text: 'Отмена', style: 'cancel' }])
  if (!ready) return <Screen><PageHeader title={isNew ? 'Создание транзакции' : 'Редактирование транзакции'} />{loadError ? <><ErrorNotice message={loadError} /><Button title="Повторить чтение" onPress={() => setAttempt((value) => value + 1)} /></> : <EmptyState title="Загрузка транзакции…" />}</Screen>
  return <Screen keyboardShouldPersistTaps="handled">
    <PageHeader title={isNew ? 'Создание транзакции' : 'Редактирование транзакции'} action={!isNew ? <Pressable accessibilityRole="button" accessibilityLabel="История транзакции" style={styles.menu} onPress={menu}><MaterialCommunityIcons name="dots-vertical" size={22} color={palette.primary} /></Pressable> : undefined} />
    {locked ? <Notice tone="warning" message="Редактирование недоступно: связанная работа не активна или отсутствует." /> : null}
    <Surface pointerEvents={loading ? 'none' : 'auto'}>
      <FinanceRelationPicker label={terms.labelCapitalized} value={values.eventId} testID="transaction-event" disabled={locked} options={events.filter((event) => event.status === 'active' || event._id === values.eventId).map((event) => ({ id: event._id, title: event.eventType || terms.labelCapitalized, meta: event.eventDate && Number.isFinite(Date.parse(event.eventDate)) ? new Date(event.eventDate).toLocaleString('ru-RU') : 'Без даты', search: event.description }))} onChange={selectEvent} />
      <FinanceRelationPicker label="Клиент" value={selectedClientId} testID="transaction-client" disabled={locked} options={clients.map((client) => ({ id: client._id, title: clientName(client), meta: String(client.phone || ''), search: [client.phone, client.telegram, client.max, client.email].filter(Boolean).join(' ') }))} onChange={selectClient} />
      <CompactField testID="transaction-amount" label="Сумма" value={values.amount} onChangeText={(amount) => change({ amount })} keyboardType="decimal-pad" editable={!locked} placeholder="0" />
      {values.category === 'taxes' && selectedEvent ? <Button title="6% от договорённости" variant="secondary" disabled={locked || loading} onPress={() => change({ amount: String(Math.round(Number(selectedEvent.contractSum || 0) * 6) / 100) })} /> : null}
      <SectionTitle>Тип</SectionTitle><View style={styles.options}><Choice active={values.type === 'income'} label="Доход" tone="income" disabled={locked} onPress={() => setType('income')} /><Choice active={values.type === 'expense'} label="Расход" tone="expense" disabled={locked} onPress={() => setType('expense')} /></View>
      <SectionTitle>Категория</SectionTitle><View style={styles.options}>{categories.map((category) => <Choice key={category.value} active={values.category === category.value} label={category.label} disabled={locked} onPress={() => change({ category: category.value })} />)}</View>
      <SectionTitle>Метод оплаты</SectionTitle><View style={styles.options}>{PAYMENT_METHODS.map(([paymentMethod, label]) => <Choice key={paymentMethod} active={values.paymentMethod === paymentMethod} label={label} disabled={locked} onPress={() => change({ paymentMethod })} />)}</View>
      <CompactField label={values.paymentMethod === 'obligation' ? 'Плановая дата' : 'Дата'} value={values.date} onChangeText={(date) => change({ date })} editable={!locked} placeholder="ГГГГ-ММ-ДД" />
      <CompactField label="Время" value={values.time} onChangeText={(time) => change({ time })} editable={!locked} placeholder="ЧЧ:ММ" keyboardType="numbers-and-punctuation" />
      {values.paymentMethod === 'obligation' ? <Notice tone="warning" message="Для обязательства это плановая дата исполнения. Обязательство не считается фактическим доходом или расходом." /> : fulfill ? <Notice tone="info" message="После смены метода оплаты укажите фактическую дату совершения транзакции." /> : null}
      <CompactField testID="transaction-comment" label="Комментарий" value={values.comment} onChangeText={(comment) => change({ comment })} editable={!locked} multiline />
    </Surface>
    {error ? <ErrorNotice message={error} /> : null}
    <Button testID="save-transaction" title="Сохранить" onPress={save} loading={loading} disabled={locked} />
    {!isNew ? <Button title="Удалить транзакцию" variant="danger" onPress={remove} disabled={locked || loading} /> : null}
  </Screen>
}
function Choice({ active, label, onPress, disabled = false, tone }: { active: boolean; label: string; onPress: () => void; disabled?: boolean; tone?: 'income' | 'expense' }) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const role = palette.notice[tone === 'expense' ? 'danger' : 'success']
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} style={[styles.option, active && { borderColor: role.border, backgroundColor: role.background }, disabled && styles.disabled]} onPress={onPress}><Text style={[styles.optionText, active && { color: role.text }]}>{label}</Text></Pressable>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  menu: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 4, backgroundColor: palette.surface },
  optionText: { color: palette.cardMeta, fontSize: 13, fontWeight: '600' }, disabled: { opacity: 0.65 },
})
