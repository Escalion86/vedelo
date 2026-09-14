import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import {
  TRANSACTION_CATEGORIES,
  formatTransactionDateInput,
  parseTransactionDateInput,
} from '../../../src/shared/domain/finance'
import type { Client, Event, Transaction } from '../../../src/shared/domain/types'
import { formatPhoneForDisplay } from '../../../src/shared/format/phone'
import { getCachedEntity, listCachedEntities } from '../../../src/shared/storage/cache'
import { deleteLocalEntity, saveLocalEntity } from '../../../src/shared/storage/mutations'
import { Button, ErrorNotice, Field, PageHeader, Screen, SectionTitle, Surface } from '../../../src/shared/ui/components'
import { colors, radius, spacing } from '../../../src/shared/ui/theme'
import { useWorkItemTerminology } from '../../../src/shared/hooks/useWorkItemTerminology'

const PAYMENT_METHODS = [
  ['transfer', 'Перевод'], ['account', 'Расчётный счёт'], ['cash', 'Наличные'],
  ['barter', 'Бартер'], ['obligation', 'Обязательство'],
] as const

const personName = (client?: Client) => client
  ? [client.firstName, client.secondName].filter(Boolean).join(' ') || formatPhoneForDisplay(client.phone) || 'Клиент'
  : 'Клиент'

export default function TransactionEditScreen() {
  const terms = useWorkItemTerminology()
  const params = useLocalSearchParams<{ id: string; eventId?: string; clientId?: string }>()
  const isNew = params.id === 'new'
  const queryClient = useQueryClient()
  const [clients, setClients] = useState<Client[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [values, setValues] = useState({
    amount: '', type: 'income' as Transaction['type'], category: 'deposit',
    paymentMethod: 'transfer' as NonNullable<Transaction['paymentMethod']>,
    date: formatTransactionDateInput(new Date().toISOString()), comment: '',
    eventId: params.eventId || '', clientId: params.clientId || '',
  })
  const [initialPaymentMethod, setInitialPaymentMethod] = useState<Transaction['paymentMethod']>()
  const [initialDate, setInitialDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      listCachedEntities<Client>('clients'),
      listCachedEntities<Event>('events'),
      !isNew && params.id ? getCachedEntity<Transaction>('transactions', params.id) : null,
    ]).then(([clientItems, eventItems, transaction]) => {
      setClients(clientItems)
      setEvents(eventItems)
      if (transaction) {
        const date = formatTransactionDateInput(transaction.date)
        setValues({
          amount: String(transaction.amount), type: transaction.type,
          category: transaction.category || 'other',
          paymentMethod: transaction.paymentMethod || 'transfer', date,
          comment: transaction.comment || '', eventId: transaction.eventId || '',
          clientId: transaction.clientId || '',
        })
        setInitialPaymentMethod(transaction.paymentMethod || 'transfer')
        setInitialDate(date)
        return
      }
      if (params.eventId) {
        const event = eventItems.find((item) => item._id === params.eventId)
        if (event?.clientId) setValues((current) => ({ ...current, clientId: event.clientId || '' }))
      }
    }).catch(() => setError('Не удалось загрузить данные транзакции'))
  }, [isNew, params.clientId, params.eventId, params.id])

  const selectedEvent = useMemo(() => events.find((event) => event._id === values.eventId), [events, values.eventId])
  const selectedClient = useMemo(() => clients.find((client) => client._id === values.clientId), [clients, values.clientId])
  const availableEvents = useMemo(() => events.filter((event) =>
    event.status === 'active' || event._id === values.eventId), [events, values.eventId])
  const categories = useMemo(() => TRANSACTION_CATEGORIES.filter((category) =>
    category.type === values.type || category.type === 'both'), [values.type])

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const setType = (type: Transaction['type']) => {
    const nextCategories = TRANSACTION_CATEGORIES.filter((category) => category.type === type || category.type === 'both')
    setValues((current) => ({
      ...current,
      type,
      category: nextCategories.some((category) => category.value === current.category)
        ? current.category
        : nextCategories[0]?.value || 'other',
    }))
  }

  const selectEvent = (eventId: string) => {
    const event = events.find((item) => item._id === eventId)
    setValues((current) => ({
      ...current,
      eventId,
      clientId: event?.clientId || '',
    }))
  }

  const save = async () => {
    const amount = Number(values.amount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Введите сумму больше нуля')
      return
    }
    const date = parseTransactionDateInput(values.date)
    if (!date) {
      setError('Введите существующую дату в формате ГГГГ-ММ-ДД')
      return
    }
    if (selectedEvent && selectedEvent.status !== 'active') {
      setError(`Транзакции можно изменять только у активного ${terms.genitive}`)
      return
    }
    if (
      !isNew &&
      initialPaymentMethod === 'obligation' &&
      values.paymentMethod !== 'obligation' &&
      values.date === initialDate
    ) {
      setError('После исполнения обязательства укажите фактическую дату оплаты')
      return
    }
    setLoading(true)
    setError('')
    try {
      await saveLocalEntity({
        entityType: 'transactions',
        entityId: isNew ? undefined : params.id,
        values: {
          amount,
          type: values.type,
          category: values.category,
          paymentMethod: values.paymentMethod,
          date,
          comment: values.comment.trim(),
          eventId: values.eventId || null,
          clientId: selectedEvent?.clientId || values.clientId || null,
        },
      })
      await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'transactions'] })
      router.replace('/(tabs)/finance')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить')
    } finally {
      setLoading(false)
    }
  }

  const remove = () => Alert.alert('Удалить транзакцию?', '', [
    { text: 'Отмена', style: 'cancel' },
    {
      text: 'Удалить', style: 'destructive', onPress: async () => {
        await deleteLocalEntity('transactions', params.id)
        await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'transactions'] })
        router.replace('/(tabs)/finance')
      },
    },
  ])
  const openMenu = () => Alert.alert('Действия', '', [
    { text: 'История действий', onPress: () => router.push({ pathname: '/history', params: { entityType: 'transaction', entityId: params.id } } as never) },
    { text: 'Отмена', style: 'cancel' },
  ])

  return (
    <Screen>
      <PageHeader title={isNew ? 'Новая транзакция' : 'Редактирование'} subtitle="Доход, расход или обязательство" action={!isNew ? <Pressable style={styles.menu} onPress={openMenu}><MaterialCommunityIcons name="dots-vertical" size={22} color={colors.primary} /></Pressable> : undefined} />
      <Surface>
        <SectionTitle>Тип</SectionTitle>
        <View style={styles.options}>
          <Choice active={values.type === 'income'} label="Доход" onPress={() => setType('income')} />
          <Choice active={values.type === 'expense'} label="Расход" onPress={() => setType('expense')} />
        </View>
        <Field testID="transaction-amount" label="Сумма" value={values.amount} onChangeText={(value) => set('amount', value)} keyboardType="decimal-pad" placeholder="0" />
        <SectionTitle>Категория</SectionTitle>
        <View style={styles.options}>{categories.map((category) => <Choice key={category.value} active={values.category === category.value} label={category.label} onPress={() => set('category', category.value)} />)}</View>
        <SectionTitle>Способ оплаты</SectionTitle>
        <View style={styles.options}>{PAYMENT_METHODS.map(([value, label]) => <Choice key={value} active={values.paymentMethod === value} label={label} onPress={() => set('paymentMethod', value)} />)}</View>
        {values.paymentMethod === 'obligation' ? <Text style={styles.obligationHint}>Обязательство не считается фактическим доходом или расходом. Укажите плановую дату исполнения.</Text> : null}
        <Field label={values.paymentMethod === 'obligation' ? 'Плановая дата' : 'Дата'} value={values.date} onChangeText={(value) => set('date', value)} placeholder="2026-07-15" />
        <Field testID="transaction-comment" label="Комментарий" value={values.comment} onChangeText={(value) => set('comment', value)} multiline />
      </Surface>

      <Surface>
        <SectionTitle>{terms.labelCapitalized}</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>
          <Choice active={!values.eventId} label={`Без ${terms.genitive}`} onPress={() => set('eventId', '')} />
          {availableEvents.map((event) => <Choice key={event._id} active={values.eventId === event._id} label={`${event.eventType || terms.labelCapitalized}${event.eventDate ? ` · ${new Date(event.eventDate).toLocaleDateString('ru-RU')}` : ''}`} onPress={() => selectEvent(event._id)} />)}
        </ScrollView>
        {selectedEvent && selectedEvent.status !== 'active' ? <Text style={styles.readOnlyHint}>{terms.labelCapitalized} не активен{terms.mode === 'events' ? 'о' : ''}. Сохранение транзакции недоступно.</Text> : null}
        <SectionTitle>Клиент</SectionTitle>
        {values.eventId ? (
          <Text style={styles.linkedClient}>{selectedClient ? personName(selectedClient) : `У ${terms.genitive} клиент не выбран`}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>
            <Choice active={!values.clientId} label="Не выбран" onPress={() => set('clientId', '')} />
            {clients.map((client) => <Choice key={client._id} active={values.clientId === client._id} label={personName(client)} onPress={() => set('clientId', client._id)} />)}
          </ScrollView>
        )}
      </Surface>

      {error ? <ErrorNotice message={error} /> : null}
      <Button testID="save-transaction" title="Сохранить" onPress={save} loading={loading} />
      {!isNew ? <Button title="Удалить транзакцию" variant="danger" onPress={remove} /> : null}
    </Screen>
  )
}

const Choice = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" style={[styles.option, active && styles.optionActive]} onPress={onPress}>
    <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
  </Pressable>
)

const styles = StyleSheet.create({
  menu: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  horizontalOptions: { gap: 6, paddingRight: spacing.md },
  option: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  optionActive: { backgroundColor: colors.primary }, optionText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' }, optionTextActive: { color: '#fff' },
  obligationHint: { color: colors.warning, fontSize: 12, lineHeight: 18, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  readOnlyHint: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  linkedClient: { color: colors.text, fontSize: 14, fontWeight: '700', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
})
