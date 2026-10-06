import { supportCursor } from '../../src/features/support/pagination'
import { CompactField } from '../../src/shared/ui/CompactField'
import { useScreenLifetime } from '../../src/features/profile/useScreenLifetime'
import { safeHttps, paymentDate } from '../../src/features/profile/presentation'
import { useThemeStyles } from '../../src/shared/ui/ThemeProvider'
import { Notice } from '../../src/shared/ui/Notice'
import { SupportUserAccess } from '../../src/features/support/SupportUserAccess'
import { useCallback, useRef, useState } from 'react'
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Button, EmptyState, ErrorNotice, PageHeader, Screen, Surface } from '../../src/shared/ui/components'
import { radius, spacing, type Palette } from '../../src/shared/ui/theme'
import { getSupportTicket, markSupportTicketRead, replySupportTicket } from '../../src/features/support/api'
import { SupportImagePicker } from '../../src/features/support/ImagePicker'
import type { SelectedSupportImage, SupportMessage, SupportStatus, SupportTicket } from '../../src/features/support/types'

const categories = { bug: 'Ошибка', idea: 'Идея', question: 'Вопрос' }
const statuses: Record<SupportStatus, string> = { open: 'Открыт', in_progress: 'В работе', resolved: 'Решён' }

export default function SupportTicketScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  return <SupportUserAccess><UserSupportTicketScreen key={id} /></SupportUserAccess>
}

function UserSupportTicketScreen() {
  const styles = useThemeStyles(createStyles)
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const capture = useScreenLifetime()
  const lock = useRef(false), revision = useRef(0), seen = useRef(new Set<string>())
  const [uncertain, setUncertain] = useState(false)
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<SelectedSupportImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadInitial = useCallback(async () => {
    if (!id || lock.current) return
    const current = capture(), generation = ++revision.current
    setLoading(true); setError('')
    try {
      const response = await getSupportTicket(id)
      if (!current() || generation !== revision.current) return
      if (response.data?.ticket?.id !== id) throw new Error('Обращение не подтверждено')
      setTicket(response.data.ticket); setMessages(response.data.messages)
      setCursor(supportCursor(response.meta)); seen.current.clear()
      if (response.data.ticket.unread) {
        await markSupportTicketRead(id)
        if (current() && generation === revision.current) setTicket((value) => value ? { ...value, unread: false } : value)
      }
    } catch (reason) { if (current() && generation === revision.current) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить тикет') }
    finally { if (current() && generation === revision.current) setLoading(false) }
  }, [id, capture])
  useFocusEffect(useCallback(() => { void loadInitial(); return () => { revision.current++ } }, [loadInitial]))
  const loadOlder = async () => {
    if (!cursor || lock.current) return
    const current = capture(), generation = revision.current
    lock.current = true; setLoading(true); setError('')
    try {
      const response = await getSupportTicket(id, cursor)
      if (!current() || generation !== revision.current) return
      seen.current.add(cursor)
      setMessages((previous) => [...new Map([...response.data.messages, ...previous].map((item) => [item.id, item])).values()])
      const next = supportCursor(response.meta)
      const repeated = Boolean(next && seen.current.has(next))
      setCursor(repeated ? null : next)
      if (repeated) setError('Сервер повторил страницу. Обновите переписку.')
    } catch (reason) { if (current()) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить сообщения') }
    finally { lock.current = false; if (current()) setLoading(false); else if (capture()()) void loadInitial() }
  }
  const send = async () => {
    if (lock.current || loading || uncertain) return
    if (!message.trim()) return setError('Введите сообщение')
    lock.current = true; revision.current++
    const current = capture(); let sent = false
    setLoading(true); setError('')
    try {
      const network = await NetInfo.fetch()
      if (!current()) return
      if (!network.isConnected || network.isInternetReachable === false) { setError('Для отправки сообщения требуется интернет'); return }
      sent = true; setUncertain(true)
      const response = await replySupportTicket(id, message.trim(), images)
      if (!current()) return
      const sentMessage = response.data?.message
      if (!sentMessage?.id) throw new Error('Ответ не подтверждён')
      let read = await getSupportTicket(id), next = supportCursor(read.meta)
      const confirmed = new Set(read.data.messages.map((item) => item.id)), cursors = new Set<string>()
      while (!confirmed.has(sentMessage.id) && read.meta.hasMore && next && !cursors.has(next)) {
        if (!current()) return
        cursors.add(next); read = await getSupportTicket(id, next)
        read.data.messages.forEach((item) => confirmed.add(item.id)); next = supportCursor(read.meta)
      }
      if (!current()) return
      if (!confirmed.has(sentMessage.id)) throw new Error('Ответ не подтверждён повторным чтением')
      setTicket(response.data.ticket)
      setMessages((previous) => [...new Map([...previous, sentMessage].map((item) => [item.id, item])).values()])
      setUncertain(false); setMessage(''); setImages([])
    } catch (reason) { if (current()) { setUncertain(sent); setError(reason instanceof Error ? reason.message : 'Не удалось отправить сообщение') } }
    finally { lock.current = false; if (current()) setLoading(false); else if (capture()()) void loadInitial() }
  }
  const openAttachment = async (url: string) => {
    const safe = safeHttps(url)
    if (!safe) return setError('Ссылка вложения недоступна')
    try { await Linking.openURL(safe) } catch { setError('Не удалось открыть вложение') }
  }
  return <Screen><PageHeader title={ticket?.title || 'Обращение'} subtitle={ticket ? `${categories[ticket.category]} · ${statuses[ticket.status]}` : 'Диалог с разработчиком'} />{error ? <><ErrorNotice message={error} /><Button title="Обновить переписку" variant="secondary" onPress={loadInitial} disabled={loading} /></> : null}{uncertain && !loading ? <Notice tone="warning" message="Результат отправки неизвестен. Черновик сохранён. Проверьте переписку перед новым сообщением, чтобы избежать дубля." /> : null}{uncertain && !loading ? <Button title="Разрешить повтор после проверки" variant="secondary" onPress={() => Alert.alert('Повторить ответ?', 'Проверьте переписку. Если сообщение уже сохранено, повтор создаст дубль.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Разрешить повтор', onPress: () => { if (capture()()) setUncertain(false) } }])} /> : null}{cursor ? <Button title="Показать ранние сообщения" variant="secondary" onPress={loadOlder} loading={loading} /> : null}<View style={styles.messages}>{ticket && !loading && !error && !messages.length ? <EmptyState title="Сообщений пока нет" /> : null}{messages.map((item) => { const own = item.authorRole === 'user'; return <View key={item.id} testID={`support-message-${item.id}`} style={[styles.messageRow, own ? styles.ownRow : styles.otherRow]}><Surface style={[styles.message, own && styles.ownMessage]}><Text style={styles.meta}>{item.authorLabel || (item.authorRole === 'developer' ? 'Разработчик' : 'Пользователь')} · {paymentDate(item.createdAt)}</Text><Text style={styles.body}>{item.body}</Text>{item.attachments?.length ? <View style={styles.attachments}>{item.attachments.map((attachment) => <Pressable accessibilityRole="button" accessibilityLabel={attachment.name} key={attachment.url} onPress={() => void openAttachment(attachment.url)}><Image source={{ uri: attachment.url }} style={styles.attachment} accessible={false} /></Pressable>)}</View> : null}</Surface></View> })}</View>{ticket ? <Surface><CompactField editable={!loading} label="Сообщение" value={message} onChangeText={setMessage} maxLength={5000} multiline placeholder="Напишите сообщение…" /><SupportImagePicker images={images} onChange={setImages} onError={setError} disabled={loading} /><Button title="Отправить" onPress={send} loading={loading} disabled={uncertain} /></Surface> : null}{loading && !ticket ? <Text style={styles.loading}>Загружаем…</Text> : null}</Screen>
}

const createStyles = (palette: Palette) => StyleSheet.create({ messages: { gap: spacing.sm }, messageRow: { flexDirection: 'row' }, ownRow: { justifyContent: 'flex-end' }, otherRow: { justifyContent: 'flex-start' }, message: { maxWidth: '92%' }, ownMessage: { borderColor: palette.primary }, meta: { color: palette.cardMuted, fontSize: 11, marginBottom: spacing.xs }, body: { color: palette.text, fontSize: 14, lineHeight: 20 }, attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }, attachment: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: palette.rowPressed }, loading: { color: palette.cardMuted, textAlign: 'center' } })
