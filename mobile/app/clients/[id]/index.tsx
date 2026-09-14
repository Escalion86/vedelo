import { useEffect, useMemo, useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { Client, Event, Transaction } from '../../../src/shared/domain/types'
import { formatPhoneForDisplay } from '../../../src/shared/format/phone'
import { getCachedEntity, listCachedEntities } from '../../../src/shared/storage/cache'
import { Button, EmptyState, PageHeader, Screen, SectionTitle, StatusChip, Surface } from '../../../src/shared/ui/components'
import { colors, radius, spacing } from '../../../src/shared/ui/theme'

const open = (url: string) => Linking.openURL(url).catch(() => undefined)
const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`
const clientTypeLabel: Record<string, string> = {
  none: '', host: 'Ведущий', organizer: 'Организатор', colleague: 'Коллега',
}
const channelLabel: Record<string, string> = {
  phone: 'Телефон', telegram: 'Telegram', whatsapp: 'WhatsApp', max: 'MAX',
  vk: 'VK', other: 'Другой канал',
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    if (!id) return
    Promise.all([
      getCachedEntity<Client>('clients', id),
      listCachedEntities<Event>('events'),
      listCachedEntities<Transaction>('transactions'),
    ]).then(([clientItem, eventItems, transactionItems]) => {
      setClient(clientItem)
      setEvents(eventItems)
      setTransactions(transactionItems)
    })
  }, [id])

  const relatedEvents = useMemo(() => events
    .filter((event) => event.clientId === id || event.otherContacts?.some((contact) => contact.clientId === id))
    .sort((a, b) => new Date(b.eventDate || 0).getTime() - new Date(a.eventDate || 0).getTime()), [events, id])
  const relatedEventIds = useMemo(() => new Set(relatedEvents.map((event) => event._id)), [relatedEvents])
  const relatedTransactions = useMemo(() => transactions
    .filter((transaction) => transaction.clientId === id || Boolean(transaction.eventId && relatedEventIds.has(transaction.eventId)))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()), [id, relatedEventIds, transactions])

  if (!client) return <Screen><PageHeader title="Клиент" /><EmptyState title="Клиент не найден" description="Возможно, запись удалена на другом устройстве." /></Screen>

  const name = [client.firstName, client.secondName, client.thirdName].filter(Boolean).join(' ') || 'Без имени'
  const phone = String(client.phone || '').replace(/\D/g, '')
  const whatsapp = String(client.whatsapp || client.phone || '').replace(/\D/g, '')
  const telegram = (client.telegram || '').replace(/^@/, '')
  const vkUrl = client.vk?.startsWith('http') ? client.vk : client.vk ? `https://vk.com/${client.vk.replace(/^@/, '')}` : ''
  const income = relatedTransactions.filter((item) => item.type === 'income' && item.paymentMethod !== 'obligation').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const expense = relatedTransactions.filter((item) => item.type === 'expense' && item.paymentMethod !== 'obligation').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const obligations = relatedTransactions.filter((item) => item.paymentMethod === 'obligation').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const openMenu = () => Alert.alert('Действия', '', [
    { text: 'История действий', onPress: () => router.push({ pathname: '/history', params: { entityType: 'client', entityId: client._id } } as never) },
    { text: 'Отмена', style: 'cancel' },
  ])

  return (
    <Screen>
      <PageHeader
        title={name}
        subtitle={[clientTypeLabel[client.clientType || 'none'] || client.clientType, client.town].filter(Boolean).join(' · ')}
        action={<View style={styles.headerActions}><Pressable style={styles.edit} onPress={() => router.push(`/clients/edit/${client._id}` as never)}><MaterialCommunityIcons name="pencil-outline" size={21} color={colors.primary} /></Pressable><Pressable style={styles.edit} onPress={openMenu}><MaterialCommunityIcons name="dots-vertical" size={22} color={colors.primary} /></Pressable></View>}
      />
      {client.syncStatus && client.syncStatus !== 'synced' ? <View style={styles.statusRow}><StatusChip label="Ожидает синхронизации" tone="warning" /></View> : null}
      <View style={styles.actions}>
        {phone ? <Action icon="phone-outline" label="Позвонить" onPress={() => open(`tel:${phone}`)} /> : null}
        {whatsapp ? <Action icon="whatsapp" label="WhatsApp" onPress={() => open(`https://wa.me/${whatsapp}`)} /> : null}
        {telegram ? <Action icon="send-outline" label="Telegram" onPress={() => open(client.telegram?.startsWith('http') ? client.telegram : `https://t.me/${telegram}`)} /> : null}
        {vkUrl ? <Action icon="alpha-v-box" label="VK" onPress={() => open(vkUrl)} /> : null}
        {client.town ? <Action icon="map-marker-outline" label="Карты" onPress={() => open(`geo:0,0?q=${encodeURIComponent(client.town || '')}`)} /> : null}
      </View>

      <Surface>
        <SectionTitle>Контакты</SectionTitle>
        <Info label="Телефон" value={formatPhoneForDisplay(client.phone)} />
        <Info label="Email" value={client.email} />
        <Info label="Telegram" value={client.telegram} />
        <Info label="Instagram" value={client.instagram} />
        <Info label="VK" value={client.vk} />
        <Info label="Приоритетный канал" value={client.preferredContactChannel === 'other' ? client.preferredContactChannelOther : channelLabel[client.preferredContactChannel || '']} />
      </Surface>

      {client.comment ? <Surface><SectionTitle>Комментарий</SectionTitle><Text style={styles.comment}>{client.comment}</Text></Surface> : null}
      {client.significantDates?.length ? (
        <Surface>
          <SectionTitle>Значимые даты</SectionTitle>
          {client.significantDates.map((date, index) => (
            <View key={date._id || `${date.title}-${index}`} style={styles.significantDate}>
              <View style={styles.dateIcon}><MaterialCommunityIcons name="calendar-heart" size={20} color={colors.primary} /></View>
              <View style={styles.grow}>
                <Text style={styles.dateName}>{date.title || 'Дата'}</Text>
                <Text style={styles.dateValue}>{date.date ? new Date(date.date).toLocaleDateString('ru-RU') : 'Дата не указана'}</Text>
                {date.comment ? <Text style={styles.muted}>{date.comment}</Text> : null}
              </View>
            </View>
          ))}
        </Surface>
      ) : null}

      <Surface>
        <SectionTitle>Мероприятия · {relatedEvents.length}</SectionTitle>
        {relatedEvents.length ? relatedEvents.map((event) => (
          <Pressable key={event._id} style={styles.relatedRow} onPress={() => router.push(`/events/${event._id}` as never)}>
            <View style={styles.grow}>
              <Text style={styles.relatedTitle}>{event.eventType || 'Мероприятие'}</Text>
              <Text style={styles.muted}>{event.eventDate ? new Date(event.eventDate).toLocaleString('ru-RU') : 'Дата не назначена'}</Text>
            </View>
            {event.contractSum ? <Text style={styles.relatedAmount}>{money(event.contractSum)}</Text> : null}
            <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
          </Pressable>
        )) : <Text style={styles.emptyText}>Связанных мероприятий пока нет.</Text>}
      </Surface>

      <Surface>
        <SectionTitle>Финансы · {relatedTransactions.length}</SectionTitle>
        <View style={styles.financeSummary}>
          <FinanceValue label="Доход" value={income} tone="success" />
          <FinanceValue label="Расход" value={expense} tone="danger" />
          <FinanceValue label="Обязательства" value={obligations} tone="warning" />
        </View>
        {relatedTransactions.map((transaction) => (
          <Pressable key={transaction._id} style={styles.relatedRow} onPress={() => router.push(`/finance/edit/${transaction._id}` as never)}>
            <View style={styles.grow}><Text style={styles.relatedTitle}>{transaction.category || 'Без категории'}</Text><Text style={styles.muted}>{transaction.date ? new Date(transaction.date).toLocaleDateString('ru-RU') : 'Без даты'}</Text></View>
            <Text style={[styles.relatedAmount, transaction.type === 'income' ? styles.income : styles.expense]}>{transaction.type === 'income' ? '+' : '−'}{money(Number(transaction.amount || 0))}</Text>
          </Pressable>
        ))}
        {!relatedTransactions.length ? <Text style={styles.emptyText}>Связанных транзакций пока нет.</Text> : null}
      </Surface>

      <Button title="Переписки Avito и VK" variant="secondary" onPress={() => router.push({ pathname: '/conversations', params: { clientId: client._id } } as never)} />
      <Button title={`Файлы и документы · ${client.documents?.length || 0}`} variant="secondary" onPress={() => router.push(`/clients/${client._id}/documents` as never)} disabled={client._id.startsWith('local-')} />
      <Button title="Добавить транзакцию" variant="secondary" onPress={() => router.push({ pathname: '/finance/edit/new', params: { clientId: client._id } } as never)} />
      <Button title="Новое мероприятие" onPress={() => router.push({ pathname: '/events/edit/new', params: { clientId: client._id } } as never)} />
      <Button title="Объединить дубликат" variant="secondary" disabled={client._id.startsWith('local-') || Boolean(client.syncStatus && client.syncStatus !== 'synced')} onPress={() => router.push(`/clients/${client._id}/merge` as never)} />
    </Screen>
  )
}

const Info = ({ label, value }: { label: string; value?: string }) => value ? <View style={styles.info}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View> : null
const Action = ({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) => <Pressable accessibilityRole="button" style={styles.action} onPress={onPress}><View style={styles.actionIcon}><MaterialCommunityIcons name={icon} size={23} color={colors.primary} /></View><Text style={styles.actionLabel}>{label}</Text></Pressable>
const FinanceValue = ({ label, value, tone }: { label: string; value: number; tone: 'success' | 'danger' | 'warning' }) => <View style={[styles.financeValue, tone === 'success' ? styles.financeSuccess : tone === 'danger' ? styles.financeDanger : styles.financeWarning]}><Text style={styles.financeLabel}>{label}</Text><Text style={styles.financeAmount}>{money(value)}</Text></View>

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  edit: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: spacing.sm },
  action: { width: 62, minHeight: 68, alignItems: 'center', gap: 6 },
  actionIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: colors.text, fontSize: 11, fontWeight: '700' },
  info: { gap: 3, paddingVertical: 5 }, label: { color: colors.textMuted, fontSize: 11 }, value: { color: colors.text, fontSize: 15 },
  comment: { color: colors.text, fontSize: 14, lineHeight: 21 }, grow: { flex: 1 }, muted: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  significantDate: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.xs },
  dateIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  dateName: { color: colors.text, fontSize: 14, fontWeight: '700' }, dateValue: { color: colors.text, fontSize: 13, marginTop: 2 },
  relatedRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  relatedTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, relatedAmount: { color: colors.text, fontSize: 12, fontWeight: '700' },
  income: { color: colors.success }, expense: { color: colors.danger }, emptyText: { color: colors.textMuted, fontSize: 13 },
  financeSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  financeValue: { minWidth: 96, flex: 1, padding: spacing.sm, borderRadius: radius.md },
  financeSuccess: { backgroundColor: colors.successSoft }, financeDanger: { backgroundColor: colors.dangerSoft }, financeWarning: { backgroundColor: colors.warningSoft },
  financeLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' }, financeAmount: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 3 },
})
