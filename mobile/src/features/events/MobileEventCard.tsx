import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { Client, Service, Transaction } from '../../shared/domain/types'
import { Surface } from '../../shared/ui/components'
import { QuickActionsSheet, QuickContacts, openContactUrl } from '../../shared/ui/QuickContacts'
import { useTheme, useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import type { EventCalendarOccurrence } from './calendar'
import { buildEventNavigationLinks } from './navigation'
import { eventPublicApiSource, isEventImportChecked, type ListEvent } from './filters'
import { formatEventCardMoney, getEventCardAddress, getEventCardAttention,
  getEventCardClientName, getEventCardFinance, getEventCardMoneyText, getEventCardTaskPresentation, getEventCardStatus,
  getEventCardStatusKey, getEventCardTitle, getEventCardDateParts } from './eventCard'

type Props = {
  event: ListEvent; defaultTown?: string; client?: Client; clientsById?: ReadonlyMap<string, Client>
  services: Service[]; transactions: Transaction[]; occurrence?: EventCalendarOccurrence
  testID: string; onPress: () => void; loading?: boolean; error?: string
}
export const MobileEventCard = ({ event, defaultTown, client, clientsById, services, transactions, occurrence, testID, onPress, loading = false, error }: Props) => {
  const styles = useThemeStyles(createStyles)
  const { palette } = useTheme()
  const { width } = useWindowDimensions()
  const [sheet, setSheet] = useState<'actions' | 'contacts' | null>(null)
  const status = getEventCardStatus(event)
  const finance = getEventCardFinance(event, transactions)
  const attention = getEventCardAttention(event, transactions)
  const address = getEventCardAddress(event, defaultTown)
  const date = getEventCardDateParts(event.eventDate)
  const source = eventPublicApiSource(event)
  const otherContacts = (event.otherContacts || []).filter((contact) => contact.clientId)
  const selectedTask = occurrence?.kind === 'contact' ? (event.additionalEvents || []).find((task, index) =>
    occurrence.key === `${event._id}:contact:${task._id || index}`) : null
  const taskInfo = selectedTask ? getEventCardTaskPresentation(selectedTask) : attention?.dateLabel ? attention : null
  const attentionTone = selectedTask?.done ? palette.status.tomorrow : taskInfo ? palette.status[taskInfo.temporalTone] : palette.status.overdue
  const busy = loading || event.syncStatus === 'syncing'
  const syncError = error || (event.syncStatus === 'failed' ? 'Не удалось синхронизировать' : event.syncStatus === 'conflict' ? 'Конфликт изменений' : '')
  const mapUrl = buildEventNavigationLinks(event.address)[0]?.url
  const indicator = (name: keyof typeof MaterialCommunityIcons.glyphMap, label: string, color: string) =>
    <MaterialCommunityIcons accessible accessibilityLabel={label} name={name} size={15} color={color} />
  const navigate = (path: string) => { setSheet(null); router.push(path as never) }
  return <View style={styles.outer}>
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${getEventCardTitle(event, services)}, ${status.label}`}
      accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Surface style={styles.shell} testID={`${testID}-shell`}>
        <View testID={`${testID}-marker`} style={[styles.marker, { backgroundColor: palette.eventCardMarker[getEventCardStatusKey(event)] }]} />
        <View style={styles.header}>
          {event.isTransferred ? indicator('share-outline', 'Передано коллеге', palette.notice.warning.text) : null}
          {event.isByContract ? indicator('file-document-check-outline', 'По договору', palette.notice.info.text) : null}
          {!isEventImportChecked(event) ? indicator('alert-outline', 'Импорт не проверен', palette.notice.warning.text) : null}
          {event.calendarSyncError ? indicator('calendar-alert', 'Ошибка календаря', palette.notice.danger.text) : null}
          {!client && !loading ? indicator('account-off-outline', 'Клиент не указан', palette.notice.danger.text) : null}
          <Text style={[styles.title, { fontSize: width < 420 ? 15.2 : 16 }]} numberOfLines={1}>{getEventCardTitle(event, services)}</Text>
        </View>
        <Pressable testID={`${testID}-overflow`} accessibilityRole="button" accessibilityLabel="Действия с работой" accessibilityState={{ expanded: sheet === 'actions', disabled: busy }}
          disabled={busy} style={styles.overflow} onPress={(e) => { e.stopPropagation(); setSheet('actions') }}>
          <MaterialCommunityIcons name="dots-vertical" size={22} color={palette.cardMuted} />
        </Pressable>
        <View style={styles.middle}>
          <View style={styles.date} testID={`${testID}-date`}>
            {date ? <><View testID={`${testID}-date-heading`} style={styles.dateHeading}><Text style={styles.weekday}>{date.weekday}</Text><Text style={styles.day}>{date.day}</Text></View><Text style={styles.month}>{date.month}</Text><Text style={styles.meta}>{date.time}</Text></>
              : <Text style={styles.day}>—</Text>}
          </View>
          <View style={styles.details}>
            <View style={styles.address}>
              <Text numberOfLines={2} style={[styles.meta, styles.addressText]}>{address || '-'}</Text>
              {mapUrl ? <Pressable accessibilityRole="link" accessibilityLabel={`Открыть адрес в 2ГИС: ${address || 'Координаты места'}`}
                style={styles.mapButton} onPress={(e) => { e.stopPropagation(); void openContactUrl(mapUrl) }}>
                <MaterialCommunityIcons name="map-marker-outline" size={18} color={palette.primary} />
              </Pressable> : null}
            </View>
            {event.status === 'draft' && event.eventDate && new Date(event.dateEnd || event.eventDate) < new Date() ?
              <View style={styles.pastRequest}><Text style={styles.requestLabel}>Заявка</Text><Text style={styles.muted}>Дата прошла — уточните результат</Text></View> : null}
            {taskInfo || attention ? <View style={styles.attentionRow}>
              <View testID={`${testID}-reminder`} style={[styles.attention, { backgroundColor: attentionTone.background, borderColor: attentionTone.border }]}>
                {taskInfo ? <><Text numberOfLines={1} style={[styles.attentionDate, { color: attentionTone.text }]}>{taskInfo.dateLabel}</Text>
                  <Text numberOfLines={1} style={[styles.attentionText, { color: attentionTone.text }]}>{taskInfo.title}</Text></>
                  : <Text numberOfLines={2} style={[styles.attentionText, { color: attentionTone.text }]}>{attention?.label}</Text>}
              </View>
              {!selectedTask && attention && attention.hiddenCount > 0 ? <Text style={[styles.attentionCount, { color: attentionTone.text, backgroundColor: attentionTone.background, borderColor: attentionTone.border }]}>+{attention.hiddenCount}</Text> : null}
            </View> : null}
          </View>
          <View style={styles.amount}>
            {finance.hasObligations ? <Text style={styles.obligation} numberOfLines={1}>Обязательство</Text> : null}
            {source ? <Text style={styles.source} numberOfLines={1}>{source}</Text> : null}
            {event.status === 'closed' ? <Text accessibilityLabel={`Итог: ${formatEventCardMoney(finance.net)}`} style={[styles.money, { color: finance.net < 0 ? palette.notice.danger.text : finance.net > 0 ? palette.notice.success.text : palette.cardMuted }]}>{formatEventCardMoney(finance.net)}</Text>
              : <Text style={[styles.money, finance.paid > 0 && (finance.paid === finance.contractSum || finance.contractSum <= 0) && styles.paid]}>{finance.paid > 0 && finance.contractSum > 0 && finance.paid !== finance.contractSum
                ? <><Text style={styles.paid}>{formatEventCardMoney(finance.paid).replace(' ₽', '')}</Text>{` / ${formatEventCardMoney(finance.contractSum)}`}</>
                : getEventCardMoneyText(finance)}</Text>}
          </View>
        </View>
        <View style={styles.footer} testID={`${testID}-footer`}>
          <Text style={[styles.client, !client && styles.missing]} numberOfLines={1}>{loading ? 'Загрузка сведений…' : client ? getEventCardClientName(client) : '-'}</Text>
          <QuickContacts client={client} maxVisible={width < 360 ? 1 : width < 390 ? 2 : 4} />
          {otherContacts.length ? <Pressable accessibilityRole="button" accessibilityLabel={`Дополнительные контакты: ${otherContacts.length}`}
            accessibilityState={{ expanded: sheet === 'contacts' }} style={styles.contactsMore}
            onPress={(e) => { e.stopPropagation(); setSheet('contacts') }}><Text style={styles.moreText}>+{otherContacts.length}</Text></Pressable> : null}
        </View>
        {event.syncStatus === 'pending' ? <Text style={styles.pending}>Ожидает отправки</Text> : null}
        {busy ? <View testID={`${testID}-loading`} style={styles.loading} pointerEvents="auto"><ActivityIndicator accessibilityLabel="Загрузка" color={palette.primary} /></View> : null}
        {syncError ? <Pressable testID={`${testID}-error`} accessibilityRole="button" accessibilityLabel={`${syncError}. Открыть синхронизацию`}
          style={styles.error} onPress={(e) => { e.stopPropagation(); router.push('/sync' as never) }}><Text style={styles.errorText}>{syncError}</Text></Pressable> : null}
      </Surface>
    </Pressable>
    <QuickActionsSheet title={sheet === 'contacts' ? 'Дополнительные контакты' : 'Действия с работой'} visible={sheet !== null} onClose={() => setSheet(null)}>
      {sheet === 'contacts' ? otherContacts.map((contact, index) => {
        const other = clientsById?.get(contact.clientId!)
        return <View key={`${contact.clientId}:${index}`} style={styles.contactRow}>
          <Text style={styles.contactName}>{other ? getEventCardClientName(other) : 'Контакт недоступен'}</Text>
          {contact.comment ? <Text style={styles.meta}>{contact.comment}</Text> : null}
          <QuickContacts client={other} maxVisible={7} />
          {other ? <ButtonRow title="Открыть клиента" onPress={() => navigate(`/clients/${other._id}`)} /> : null}
        </View>
      }) : <>
        <ButtonRow title="Открыть" onPress={() => { setSheet(null); onPress() }} />
        {event.status !== 'closed' ? <ButtonRow title="Редактировать" onPress={() => navigate(`/events/edit/${event._id}`)} /> : null}
        <ButtonRow title="Документы" onPress={() => navigate(`/events/${event._id}/documents`)} />
        {event.status === 'active' ? <ButtonRow title="Добавить оплату или расход" onPress={() => {
          setSheet(null); router.push({ pathname: '/finance/edit/new', params: { eventId: event._id, clientId: event.clientId || '' } } as never)
        }} /> : null}
        {client ? <ButtonRow title="Открыть клиента" onPress={() => navigate(`/clients/${client._id}`)} /> : null}
        {syncError || event.syncStatus === 'pending' ? <ButtonRow title="Синхронизация" onPress={() => navigate('/sync')} /> : null}
      </>}
    </QuickActionsSheet>
  </View>
}
function ButtonRow({ title, onPress }: { title: string; onPress: () => void }) {
  const styles = useThemeStyles(createStyles)
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={styles.actionText}>{title}</Text></Pressable>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  outer: { paddingHorizontal: 8, paddingVertical: 4 }, pressed: { opacity: 0.82 },
  // Measured rows: minimum shell 184, grows for accessibility font sizes. No fixed getItemLayout.
  shell: { minHeight: 184, padding: 0, paddingLeft: 4, gap: 0, borderRadius: 8, overflow: 'hidden' },
  marker: { position: 'absolute', left: 0, width: 4, top: 12, bottom: 12, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  header: { minHeight: 40, paddingLeft: 4, paddingRight: 42, flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: 1, borderColor: palette.border },
  title: { flex: 1, minWidth: 0, color: palette.cardTitle, fontWeight: '600', lineHeight: 21 },
  overflow: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, flexDirection: 'row', gap: 12, paddingRight: 4 },
  date: { width: 58, borderRightWidth: 1, borderColor: palette.border, justifyContent: 'center', alignItems: 'center', paddingVertical: 4 },
  dateHeading: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  weekday: { fontSize: 12, color: palette.cardMeta },
  day: { fontSize: 22, fontWeight: '600', color: palette.cardTitle },
  month: { fontSize: 14, fontWeight: '500', color: palette.primary }, meta: { fontSize: 12, lineHeight: 17, color: palette.cardMeta },
  muted: { color: palette.cardMuted, fontSize: 12, lineHeight: 17 }, details: { flex: 1, minWidth: 0, paddingVertical: 6, gap: 4, justifyContent: 'center' },
  address: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addressText: { flexShrink: 1 },
  mapButton: { width: 28, minHeight: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40 },
  attention: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, flexShrink: 1, alignSelf: 'flex-start' },
  attentionDate: { fontSize: 11, fontWeight: '700', lineHeight: 14 }, attentionText: { fontSize: 11, lineHeight: 14 },
  attentionCount: { fontSize: 11, borderWidth: 1, borderRadius: 12, padding: 4 },
  pastRequest: { gap: 4 }, requestLabel: { fontSize: 11, color: palette.status.today.text },
  amount: { maxWidth: '34%', alignItems: 'flex-end', justifyContent: 'center', paddingVertical: 6, gap: 3 },
  obligation: { color: palette.notice.warning.text, backgroundColor: palette.notice.warning.background, fontSize: 10, padding: 3, borderRadius: 4 },
  source: { color: palette.notice.info.text, backgroundColor: palette.notice.info.background, fontSize: 10, padding: 3, borderRadius: 4 },
  money: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.cardTitle, textAlign: 'right' },
  paid: { color: palette.notice.success.text },
  footer: { minHeight: 40, paddingLeft: 6, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: palette.border },
  client: { flex: 1, minWidth: 0, color: palette.cardMeta, fontSize: 13.12 }, missing: { color: palette.notice.danger.text },
  contactsMore: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }, moreText: { color: palette.primary, fontSize: 12, fontWeight: '600' },
  pending: { position: 'absolute', top: 40, right: 4, color: palette.cardMuted, fontSize: 9, backgroundColor: palette.canvas },
  loading: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.secondaryBackground, alignItems: 'center', justifyContent: 'center' },
  error: { position: 'absolute', left: 4, right: 0, top: 40, minHeight: 32, backgroundColor: palette.notice.danger.background, padding: 6 },
  errorText: { color: palette.notice.danger.text, fontSize: 12 }, action: { minHeight: 48, justifyContent: 'center', paddingVertical: 12 }, actionText: { color: palette.text, fontSize: 16 },
  contactRow: { paddingVertical: 8, borderBottomWidth: 1, borderColor: palette.border }, contactName: { color: palette.text, fontSize: 16, fontWeight: '600' },
})
