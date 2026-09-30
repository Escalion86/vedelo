import { SupportUserAccess } from '../../src/features/support/SupportUserAccess'
import { useCallback, useState } from 'react'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Button, ErrorNotice, Field, PageHeader, Screen, Surface } from '../../src/shared/ui/components'
import { colors, radius, spacing } from '../../src/shared/ui/theme'
import { getSupportTicket, markSupportTicketRead, replySupportTicket } from '../../src/features/support/api'
import { SupportImagePicker } from '../../src/features/support/ImagePicker'
import type { SelectedSupportImage, SupportMessage, SupportStatus, SupportTicket } from '../../src/features/support/types'

const categories = { bug: 'Ошибка', idea: 'Идея', question: 'Вопрос' }
const statuses: Record<SupportStatus, string> = { open: 'Открыт', in_progress: 'В работе', resolved: 'Решён' }

export default function SupportTicketScreen() {
  return <SupportUserAccess><UserSupportTicketScreen /></SupportUserAccess>
}

function UserSupportTicketScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<SelectedSupportImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadInitial = useCallback(async () => {
    if (!id) return
    setLoading(true); setError('')
    try {
      const response = await getSupportTicket(id)
      setTicket(response.data.ticket)
      setMessages(response.data.messages)
      setCursor(response.meta.hasMore ? response.meta.nextCursor : null)
      if (response.data.ticket.unread) await markSupportTicketRead(id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить тикет') }
    finally { setLoading(false) }
  }, [id])

  useFocusEffect(useCallback(() => { void loadInitial() }, [loadInitial]))

  const loadOlder = async () => {
    if (!cursor) return
    setLoading(true); setError('')
    try {
      const response = await getSupportTicket(id, cursor)
      setMessages((current) => [...response.data.messages, ...current])
      setCursor(response.meta.hasMore ? response.meta.nextCursor : null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить сообщения') }
    finally { setLoading(false) }
  }

  const send = async () => {
    setError('')
    if (!message.trim()) return setError('Введите сообщение')
    const network = await NetInfo.fetch()
    if (!network.isConnected) return setError('Для отправки сообщения требуется интернет')
    setLoading(true)
    try {
      const response = await replySupportTicket(id, message.trim(), images)
      setTicket(response.data.ticket)
      setMessages((current) => [...current, response.data.message])
      setMessage(''); setImages([])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось отправить сообщение') }
    finally { setLoading(false) }
  }

  return <Screen><PageHeader title={ticket?.title || 'Обращение'} subtitle={ticket ? `${categories[ticket.category]} · ${statuses[ticket.status]}` : 'Диалог с разработчиком'} />{error ? <ErrorNotice message={error} /> : null}{cursor ? <Button title="Показать ранние сообщения" variant="secondary" onPress={loadOlder} loading={loading} /> : null}<View style={styles.messages}>{messages.map((item) => { const own = item.authorRole === 'user'; return <View key={item.id} testID={`support-message-${item.id}`} style={[styles.messageRow, own ? styles.ownRow : styles.otherRow]}><Surface style={[styles.message, own && styles.ownMessage]}><Text style={styles.meta}>{item.authorLabel || (item.authorRole === 'developer' ? 'Разработчик' : 'Пользователь')} · {new Date(item.createdAt).toLocaleString('ru-RU')}</Text><Text style={styles.body}>{item.body}</Text>{item.attachments?.length ? <View style={styles.attachments}>{item.attachments.map((attachment) => <Pressable key={attachment.url} onPress={() => Linking.openURL(attachment.url)}><Image source={{ uri: attachment.url }} style={styles.attachment} accessibilityLabel={attachment.name} /></Pressable>)}</View> : null}</Surface></View> })}</View>{ticket ? <Surface><Field label="Сообщение" value={message} onChangeText={setMessage} maxLength={5000} multiline placeholder="Напишите сообщение…" /><SupportImagePicker images={images} onChange={setImages} onError={setError} disabled={loading} /><Button title="Отправить" onPress={send} loading={loading} /></Surface> : null}{loading && !ticket ? <Text style={styles.loading}>Загружаем…</Text> : null}</Screen>
}

const styles = StyleSheet.create({ messages: { gap: spacing.sm }, messageRow: { flexDirection: 'row' }, ownRow: { justifyContent: 'flex-end' }, otherRow: { justifyContent: 'flex-start' }, message: { maxWidth: '92%' }, ownMessage: { borderColor: colors.primary }, meta: { color: colors.textMuted, fontSize: 11, marginBottom: spacing.xs }, body: { color: colors.text, fontSize: 14, lineHeight: 20 }, attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }, attachment: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.surfaceMuted }, loading: { color: colors.textMuted, textAlign: 'center' } })
