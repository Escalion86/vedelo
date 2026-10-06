import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import type { Client, Event, Transaction } from '../../../src/shared/domain/types'
import { formatPhoneForDisplay } from '../../../src/shared/format/phone'
import { getCachedEntity, listCachedEntities } from '../../../src/shared/storage/cache'
import { useWorkItemTerminology } from '../../../src/shared/hooks/useWorkItemTerminology'
import { Button, EmptyState, ErrorNotice, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../../src/shared/ui/components'
import { QuickContacts } from '../../../src/shared/ui/QuickContacts'
import { useTheme, useThemeStyles } from '../../../src/shared/ui/ThemeProvider'
import type { Palette } from '../../../src/shared/ui/theme'
import { clientName, contactChannelLabel, plainComment } from '../../../src/features/clients/clientList'

const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`
const dateText = (value?: string | null, significant = false) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleDateString('ru-RU', significant ? { day: '2-digit', month: 'long' } : undefined) : 'Дата не назначена'
export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const terms = useWorkItemTerminology()
  const [client, setClient] = useState<Client | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [showEvents, setShowEvents] = useState(false)
  const [showFinance, setShowFinance] = useState(false)
  useFocusEffect(useCallback(() => {
    let active = true
    setLoading(true); setError('')
    Promise.all([getCachedEntity<Client>('clients', id), listCachedEntities<Event>('events'), listCachedEntities<Transaction>('transactions')])
      .then(([clientItem, eventItems, transactionItems]) => {
        if (!active) return
        setClient(clientItem); setEvents(eventItems); setTransactions(transactionItems)
      }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Не удалось прочитать клиента') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, attempt]))
  const relatedEvents = useMemo(() => events.filter((event) => event.clientId === id || event.otherContacts?.some((contact) => contact.clientId === id))
    .sort((a, b) => (Date.parse(b.eventDate || '') || 0) - (Date.parse(a.eventDate || '') || 0)), [events, id])
  const relatedEventIds = useMemo(() => new Set(relatedEvents.map((event) => event._id)), [relatedEvents])
  const relatedTransactions = useMemo(() => transactions.filter((item) => item.clientId === id || Boolean(item.eventId && relatedEventIds.has(item.eventId)))
    .sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0)), [transactions, id, relatedEventIds])
  if (loading) return <Screen><PageHeader title="Клиент" /><ActivityIndicator accessibilityLabel="Загрузка клиента" color={palette.primary} /></Screen>
  if (error) return <Screen><PageHeader title="Клиент" /><ErrorNotice message={error} /><Button title="Повторить чтение" onPress={() => setAttempt((value) => value + 1)} /></Screen>
  if (!client) return <Screen><PageHeader title="Клиент" /><EmptyState title="Клиент не найден" description="Возможно, запись удалена на другом устройстве." /></Screen>
  const name = clientName(client)
  const phone = formatPhoneForDisplay(client.phone)
  const primaryEvents = relatedEvents.filter((event) => event.clientId === id)
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
  const canceled = primaryEvents.filter((event) => event.status === 'canceled').length
  const passed = primaryEvents.filter((event) => event.status !== 'canceled' && event.eventDate && Date.parse(event.eventDate) < startToday.getTime()).length
  const upcoming = primaryEvents.filter((event) => event.status !== 'canceled' && (!event.eventDate || Date.parse(event.eventDate) >= startToday.getTime())).length
  const directTransactions = relatedTransactions.filter((item) => item.clientId === id)
  const income = directTransactions.filter((item) => item.type === 'income' && item.paymentMethod !== 'obligation').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const expense = directTransactions.filter((item) => item.type === 'expense' && item.paymentMethod !== 'obligation').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const obligations = directTransactions.filter((item) => item.paymentMethod === 'obligation').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const requisites = ([['Наименование', client.legalName], ['ИНН', client.inn], ['КПП', client.kpp], ['ОГРН/ОГРНИП', client.ogrn], ['Банк', client.bankName], ['БИК', client.bik], ['Расчетный счет', client.checkingAccount], ['Корр. счет', client.correspondentAccount], ['Юридический адрес', client.legalAddress]] as const).filter(([, value]) => value)
  const menu = () => Alert.alert('Действия с клиентом', name, [
    { text: 'Редактировать', onPress: () => router.push(`/clients/edit/${id}` as never) },
    { text: 'История действий', onPress: () => router.push({ pathname: '/history', params: { entityType: 'client', entityId: id } } as never) },
    { text: 'Объединить дубликат', onPress: () => router.push(`/clients/${id}/merge` as never) },
    { text: 'Отмена', style: 'cancel' },
  ])
  const syncMessage = client.syncStatus === 'pending' ? 'Ожидает отправки' : client.syncStatus === 'syncing' ? 'Синхронизация клиента' : client.syncStatus === 'conflict' ? 'Конфликт изменений' : client.syncStatus === 'failed' ? 'Не удалось синхронизировать' : ''
  return <Screen>
    <PageHeader title="Клиент" action={<Pressable accessibilityRole="button" accessibilityLabel="Действия с клиентом" style={styles.iconButton} onPress={menu}><MaterialCommunityIcons name="dots-vertical" size={22} color={palette.primary} /></Pressable>} />
    <Surface testID="client-detail-header">
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.initials}>{name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</Text></View>
        <View style={styles.grow}><Text numberOfLines={1} style={styles.name}>{name}</Text>
          <View style={styles.phoneRow}><Text style={styles.muted}>{phone || 'Телефон не указан'}</Text>{phone ? <Pressable accessibilityRole="button" accessibilityLabel="Скопировать номер телефона" style={styles.copy} onPress={() => { void Clipboard.setStringAsync(phone).catch(() => setError('Не удалось скопировать номер')) }}><MaterialCommunityIcons name="content-copy" size={16} color={palette.cardMuted} /></Pressable> : null}</View>
        </View>
      </View>
      <QuickContacts client={client} maxVisible={7} />
      {contactChannelLabel(client) || client.comment ? <View style={styles.summary}>
        {contactChannelLabel(client) ? <Text style={styles.text}>Приоритетная связь: {contactChannelLabel(client)}</Text> : null}
        {client.comment ? <Text style={styles.text}>Комментарий: {plainComment(client.comment)}</Text> : null}
      </View> : null}
    </Surface>
    {syncMessage ? <Notice tone={client.syncStatus === 'failed' || client.syncStatus === 'conflict' ? 'danger' : 'info'} message={syncMessage} /> : null}
    <Surface>
      <View style={styles.sectionHeader}><SectionTitle>{terms.pluralCapitalized}</SectionTitle><SmallAction title={showEvents ? 'Скрыть' : 'Посмотреть'} onPress={() => setShowEvents((value) => !value)} /></View>
      <Kpi label="Прошли" value={String(passed)} /><Kpi label="Будут" value={String(upcoming)} /><Kpi label="Отменены" value={String(canceled)} />
      {showEvents ? relatedEvents.length ? relatedEvents.map((event) => <Pressable key={event._id} accessibilityRole="button" style={styles.related} onPress={() => router.push(`/events/${event._id}` as never)}>
        <View style={styles.grow}><Text style={styles.text}>{event.eventType || terms.labelCapitalized}</Text><Text style={styles.muted}>{dateText(event.eventDate)}{event.clientId !== id ? ' · Дополнительный контакт' : ''}</Text></View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={palette.cardMuted} />
      </Pressable>) : <Text style={styles.muted}>Связанных записей пока нет.</Text> : null}
    </Surface>
    <Surface>
      <View style={styles.sectionHeader}><SectionTitle>Финансы по транзакциям</SectionTitle><SmallAction title={showFinance ? 'Скрыть' : 'Показать'} onPress={() => setShowFinance((value) => !value)} /></View>
      <Kpi label="Доходы" value={money(income)} tone="success" /><Kpi label="Расходы" value={money(expense)} tone="danger" /><Kpi label="Итог" value={money(income - expense)} />
      {obligations ? <Notice tone="warning" message={`Обязательства (не факт оплаты): ${money(obligations)}`} /> : null}
      {showFinance ? relatedTransactions.length ? relatedTransactions.map((item) => <Pressable key={item._id} accessibilityRole="button" style={styles.related} onPress={() => router.push(`/finance/edit/${item._id}` as never)}>
        <View style={styles.grow}><Text style={styles.text}>{item.category || 'Без категории'}</Text><Text style={styles.muted}>{dateText(item.date)}{item.paymentMethod === 'obligation' ? ' · Обязательство' : ''}{item.clientId !== id ? ' · По связанной работе' : ''}</Text></View><Text style={styles.text}>{item.type === 'income' ? '+' : '−'}{money(Number(item.amount || 0))}</Text>
      </Pressable>) : <Text style={styles.muted}>Связанных транзакций пока нет.</Text> : null}
    </Surface>
    <Surface><SectionTitle>Файлы и документы</SectionTitle><Button title={`Файлы и документы · ${client.documents?.length || 0}`} variant="secondary" onPress={() => router.push(`/clients/${id}/documents` as never)} />
      {client._id.startsWith('local-') ? <Notice tone="info" message="Загрузка файлов доступна после синхронизации клиента." /> : null}
    </Surface>
    {requisites.length ? <Surface><SectionTitle>Реквизиты</SectionTitle>{requisites.map(([label, value]) => <Text key={label} style={styles.text}>{label}: {value}</Text>)}</Surface> : null}
    {client.significantDates?.some((date) => date.title || date.date || date.comment) ? <Surface><SectionTitle>Значимые даты</SectionTitle>{client.significantDates.filter((date) => date.title || date.date || date.comment).map((date, index) => <View key={date._id || index} style={styles.summary}><Text style={styles.text}>{date.title || 'Дата'}{date.date ? `: ${dateText(date.date, true)}` : ''}</Text>{date.comment ? <Text style={styles.muted}>{plainComment(date.comment)}</Text> : null}</View>)}</Surface> : null}
    <Button title="Переписки Avito и VK" variant="secondary" onPress={() => router.push({ pathname: '/conversations', params: { clientId: id } } as never)} />
    <Button title="Добавить транзакцию" variant="secondary" onPress={() => router.push({ pathname: '/finance/edit/new', params: { clientId: id } } as never)} />
    <Button title={`Создать ${terms.accusative}`} onPress={() => router.push({ pathname: '/events/edit/new', params: { clientId: id } } as never)} />
  </Screen>
}
function SmallAction({ title, onPress }: { title: string; onPress: () => void }) {
  const styles = useThemeStyles(createStyles)
  return <Pressable accessibilityRole="button" style={styles.smallAction} onPress={onPress}><Text style={styles.text}>{title}</Text></Pressable>
}
function Kpi({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'success' | 'danger' }) {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const role = palette.notice[tone]
  return <View style={[styles.kpi, { backgroundColor: tone === 'neutral' ? palette.kpiBackground : role.background, borderColor: tone === 'neutral' ? palette.kpiBorder : role.border }]}><Text style={[styles.muted, { color: role.text }]}>{label}</Text><Text style={[styles.kpiValue, { color: role.text }]}>{value}</Text></View>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, grow: { flex: 1, minWidth: 0 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' }, initials: { fontSize: 16, fontWeight: '700', color: palette.text },
  name: { fontSize: 18, fontWeight: '600', color: palette.cardTitle }, phoneRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, copy: { minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  text: { color: palette.cardMeta, fontSize: 14 }, muted: { color: palette.cardMuted, fontSize: 12 },
  summary: { borderWidth: 1, borderColor: palette.kpiBorder, backgroundColor: palette.kpiBackground, borderRadius: 8, padding: 12, gap: 8 },
  sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  smallAction: { minHeight: 36, borderWidth: 1, borderColor: palette.secondaryBorder, borderRadius: 4, paddingHorizontal: 12, justifyContent: 'center' },
  kpi: { padding: 8, borderWidth: 1, borderRadius: 8, gap: 3 }, kpiValue: { fontSize: 16, fontWeight: '600' },
  related: { minHeight: 52, flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: palette.border },
})
