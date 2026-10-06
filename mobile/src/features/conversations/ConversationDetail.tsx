import { useCallback, useRef, useState } from 'react'
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useNavigation } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import { api } from '../../shared/api/client'
import type { Client, Conversation, ConversationMessage, Event } from '../../shared/domain/types'
import { getCachedEntity, listCachedEntities } from '../../shared/storage/cache'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { Button, CompactField, EmptyState, Notice, PageHeader, Screen, SectionTitle, StatusChip, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { communicationError, localDateLabel, safeHttpUrl, serverId, successfulData } from '../calls/communication'
import { useCommunicationSession } from '../calls/useCommunicationSession'
import { checkedConversation, confirmSentMessage, conversationHistory, conversationProvider, conversationStatus, messageLimit, sentMessage } from './conversationUi'

type Pending = { kind: 'send'; messageId: string; revision: number } | { kind: 'patch'; status?: Conversation['status']; markRead?: boolean }
export const ConversationDetail = ({ provider, id }: { provider: string; id: string }) => {
  const validRoute = conversationProvider(provider) && serverId(id)
  const path = validRoute ? `/mobile/v1/conversations/${provider}/${encodeURIComponent(id)}` : ''
  const session = useCommunicationSession()
  const navigation = useNavigation()
  const styles = useThemeStyles(createStyles)
  const terms = useWorkItemTerminology()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [clientLink, setClientLink] = useState<string | null>(null)
  const [eventLink, setEventLink] = useState<string | null>(null)
  const [linksError, setLinksError] = useState('')
  const [text, setText] = useState('')
  const draft = useRef({ value: '', revision: 0 })
  const [loading, setLoading] = useState(true)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [needsCheck, setNeedsCheck] = useState(false)
  const pending = useRef<Pending | null>(null)
  const confirmation = useRef(0)
  const alertOpen = useRef(false)
  const historyScroll = useRef<ScrollView>(null)
  usePreventRemove(Boolean(text.trim()) || loading && Boolean(conversation), ({ data }) => {
    if (session.busy()) return
    const token = session.token()
    const revision = draft.current.revision
    Alert.alert('Есть неотправленный ответ', 'Выйти без сохранения текста?', [
      { text: 'Продолжить', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => { if (session.valid(token) && !session.busy() && revision === draft.current.revision) navigation.dispatch(data.action) } },
    ])
  })
  const read = useCallback(async () => {
    if (!conversationProvider(provider) || !path) throw new Error('invalid_route')
    return conversationHistory(await api.get<unknown>(`${path}/messages`), provider, id)
  }, [provider, path, id])
  const apply = useCallback((data: ReturnType<typeof conversationHistory>) => {
    setConversation(data.conversation); setMessages(data.messages); setVerified(true)
    setClientLink(null); setEventLink(null)
  }, [])
  const verifyLinks = useCallback(async (item: Conversation, token: number) => {
    const result = await Promise.allSettled([listCachedEntities<Client>('clients'), listCachedEntities<Event>('events')])
    if (!session.valid(token)) return
    setClientLink(result[0].status === 'fulfilled' && serverId(item.clientId) && result[0].value.some((client) => client._id === item.clientId) ? item.clientId : null)
    setEventLink(result[1].status === 'fulfilled' && serverId(item.eventId) && result[1].value.some((event) => event._id === item.eventId) ? item.eventId : null)
    setLinksError(result.some((entry) => entry.status === 'rejected') ? 'Не удалось проверить связанные записи. Непроверенные переходы недоступны.' : '')
  }, [session])
  const load = useCallback(async () => {
    const token = session.begin(); if (token === null) return
    confirmation.current += 1; alertOpen.current = false
    setLoading(true); setError(''); setNotice(''); setVerified(false)
    setClientLink(null); setEventLink(null)
    try {
      const data = await read()
      if (!session.valid(token)) return
      apply(data); await verifyLinks(data.conversation, token)
    } catch (reason) {
      if (session.valid(token)) { setConversation(null); setMessages([]); setError(path ? communicationError(reason, 'Не удалось загрузить переписку. Повторите чтение.') : 'Некорректный канал или ID диалога.') }
    } finally { if (session.valid(token)) setLoading(false); session.end(token) }
  }, [read, apply, verifyLinks, path, session])
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const reconcile = async (token: number) => {
    const expectation = pending.current
    if (!expectation) return
    const data = await read()
    if (!session.valid(token)) return
    if (expectation.kind === 'send') confirmSentMessage(data.messages, expectation.messageId)
    else if (expectation.markRead && data.conversation.unreadCount !== 0 || expectation.status && data.conversation.status !== expectation.status) throw new Error('unconfirmed_patch')
    apply(data)
    if (expectation.kind === 'send' && draft.current.revision === expectation.revision) { draft.current.value = ''; setText('') }
    pending.current = null; setNeedsCheck(false)
    setNotice(expectation.kind === 'send' ? 'Отправлено. Доставка клиенту не подтверждена.' : expectation.markRead ? 'Диалог отмечен прочитанным.' : 'Статус диалога обновлён.')
    await verifyLinks(data.conversation, token)
  }
  const check = async () => {
    const token = session.begin(); if (token === null) return
    setLoading(true); setError('')
    try { await reconcile(token) }
    catch (reason) { if (session.valid(token)) setError(communicationError(reason, 'Не удалось подтвердить действие. Повторите проверку истории; запрос действия не повторяется.')) }
    finally { if (session.valid(token)) setLoading(false); session.end(token) }
  }
  const send = async () => {
    if (!verified || !conversation || pending.current || !path || !conversationProvider(provider)) return
    const value = draft.current.value.trim(); const revision = draft.current.revision
    if (!value || value.length > messageLimit[provider]) return
    const token = session.begin(); if (token === null) return
    setLoading(true); setError(''); setNotice('')
    try {
      const response = await api.post<unknown>(`${path}/messages`, { text: value }, { skipRefresh: true })
      if (!session.valid(token)) return
      const sent = sentMessage(response)
      if (messages.some((message) => message._id === sent._id)) throw new Error('reused_message_id')
      pending.current = { kind: 'send', messageId: sent._id, revision }; setNeedsCheck(true)
      await reconcile(token)
    } catch (reason) {
      if (session.valid(token)) setError(communicationError(reason, 'Отправка не подтверждена. Текст сохранён. Обновите историю перед повторной отправкой.'))
    } finally { if (session.valid(token)) setLoading(false); session.end(token) }
  }
  const patch = async (body: { status?: Conversation['status']; markRead?: boolean }, snapshot: Conversation) => {
    if (!verified || pending.current || !conversationProvider(provider) || !path) return
    const token = session.begin(); if (token === null) return
    setLoading(true); setError(''); setNotice('')
    try {
      const fresh = await read()
      if (!session.valid(token)) return
      if (fresh.conversation.status !== snapshot.status || fresh.conversation.clientId !== snapshot.clientId || fresh.conversation.eventId !== snapshot.eventId) throw new Error('changed_conversation')
      checkedConversation(successfulData(await api.patch<unknown>(path, body, { skipRefresh: true })), provider, id)
      if (!session.valid(token)) return
      pending.current = { kind: 'patch', ...body }; setNeedsCheck(true)
      await reconcile(token)
    } catch (reason) {
      if (session.valid(token)) setError(communicationError(reason, 'Не удалось подтвердить изменение диалога. Обновите историю или повторите проверку.'))
    } finally { if (session.valid(token)) setLoading(false); session.end(token) }
  }
  const updateStatus = (status: NonNullable<Conversation['status']>) => {
    if (!conversation || !verified || session.busy() || pending.current || alertOpen.current) return
    const token = session.token(); const snapshot = conversation
    if (status === 'open') { void patch({ status }, snapshot); return }
    const confirmId = ++confirmation.current; alertOpen.current = true
    Alert.alert(status === 'closed' ? 'Закрыть диалог?' : 'Игнорировать диалог?', 'Изменить статус выбранного диалога?', [
      { text: 'Отмена', style: 'cancel', onPress: () => { if (confirmation.current === confirmId) { confirmation.current += 1; alertOpen.current = false } } },
      { text: 'Подтвердить', onPress: () => { if (confirmation.current !== confirmId) return; confirmation.current += 1; alertOpen.current = false; if (session.valid(token)) void patch({ status }, snapshot) } },
    ], { onDismiss: () => { if (confirmation.current === confirmId) { confirmation.current += 1; alertOpen.current = false } } })
  }
  const openEntity = async (kind: 'clients' | 'events', entityId: string) => {
    const token = session.begin(); if (token === null) return
    try {
      const entity = await getCachedEntity(kind, entityId)
      if (!session.valid(token)) return
      if (entity?._id !== entityId) throw new Error('missing_entity')
      router.push(`/${kind}/${encodeURIComponent(entityId)}` as never)
    } catch { if (session.valid(token)) { setClientLink(null); setEventLink(null); setLinksError('Связанная запись больше недоступна. Обновите данные.') } }
    finally { session.end(token) }
  }
  const openUrl = async (value: string) => {
    const url = safeHttpUrl(value); if (!url) return
    const token = session.token()
    try { await Linking.openURL(url) } catch { if (session.valid(token)) setError('Не удалось открыть ссылку на устройстве.') }
  }
  const disabled = loading || !verified || needsCheck
  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><Screen keyboardShouldPersistTaps="handled">
    <PageHeader title={conversation?.clientName || 'Диалог'} subtitle={provider === 'avito' ? conversation?.avitoItemTitle || 'Avito' : provider === 'vk' ? 'Сообщество VK' : 'Канал недоступен'} action={conversation ? <StatusChip label={conversationStatus(conversation.status)} tone={conversation.status === 'open' ? 'success' : 'neutral'} /> : null} />
    {loading ? <Notice message={conversation ? 'Обновляем переписку…' : 'Загружаем переписку…'} /> : null}
    {error ? <Notice tone="danger" message={error} /> : null}
    {notice ? <Notice tone="success" message={notice} /> : null}
    <Button title={error ? 'Повторить чтение переписки' : 'Обновить переписку'} variant="secondary" disabled={loading || !validRoute} onPress={() => void load()} />
    {needsCheck ? <Button title="Проверить действие по истории" variant="secondary" disabled={loading} onPress={() => void check()} /> : null}
    {linksError ? <Notice tone="warning" message={linksError} /> : null}
    {conversation && verified ? <>
      <View style={styles.links}>{clientLink ? <Button title="Клиент" variant="secondary" disabled={disabled} onPress={() => void openEntity('clients', clientLink)} /> : null}{eventLink ? <Button title={terms.labelCapitalized} variant="secondary" disabled={disabled} onPress={() => void openEntity('events', eventLink)} /> : null}</View>
      {!loading && (conversation.clientId && !clientLink || conversation.eventId && !eventLink) ? <Notice message="Некоторые связанные записи отсутствуют в текущих данных. Переход к ним недоступен." /> : null}
      <ScrollView ref={historyScroll} style={styles.history} contentContainerStyle={styles.historyContent} nestedScrollEnabled keyboardShouldPersistTaps="handled" onContentSizeChange={() => historyScroll.current?.scrollToEnd({ animated: false })}>
        {messages.length ? messages.map((message) => <View key={message._id} style={[styles.bubble, message.direction === 'outgoing' ? styles.outgoing : styles.incoming]}>
          <Text style={styles.message}>{message.text || 'Вложение недоступно в мобильной истории'}</Text>
          {(message.text?.match(/https?:\/\/[^\s<>]+/g) || []).filter((value) => safeHttpUrl(value)).slice(0, 5).map((value, index) => <Button key={`${index}/${value}`} title={`Открыть ссылку ${index + 1}`} variant="secondary" disabled={loading} onPress={() => void openUrl(value)} />)}
          <Text style={[styles.meta, message.direction === 'outgoing' && styles.outgoingMeta]}>{message.direction === 'outgoing' ? 'Исходящее' : 'Входящее'} · {localDateLabel(message.sentAt)} · {message.status === 'failed' ? 'Ошибка отправки' : message.status === 'sent' ? 'Отправлено' : 'Получено'}</Text>
        </View>) : !loading ? <EmptyState title="Сообщений нет" description="История этого диалога пуста." /> : null}
      </ScrollView>
      <Text style={styles.muted}>История ограничена 300 сообщениями. Медиа-вложения не передаются текущим мобильным API.</Text>
      <Surface><CompactField label="Ответ клиенту" value={text} onChangeText={(value) => { draft.current.value = value; draft.current.revision += 1; setText(value) }} multiline maxLength={conversationProvider(provider) ? messageLimit[provider] : undefined} editable={verified} placeholder="Введите ответ клиенту" style={styles.editor} /><Button title="Отправить" onPress={() => void send()} disabled={disabled || !text.trim()} /></Surface>
      {Boolean(conversation.unreadCount) ? <Button title="Отметить прочитанным" variant="secondary" disabled={disabled} onPress={() => void patch({ markRead: true }, conversation)} /> : null}
      <Surface><SectionTitle>Статус диалога</SectionTitle>{conversation.status === 'open' ? <><Button title="Закрыть диалог" variant="secondary" disabled={disabled} onPress={() => updateStatus('closed')} /><Button title="Игнорировать" variant="secondary" disabled={disabled} onPress={() => updateStatus('ignored')} /></> : <Button title="Вернуть в работу" variant="secondary" disabled={disabled} onPress={() => updateStatus('open')} />}</Surface>
    </> : null}
  </Screen></KeyboardAvoidingView>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  keyboard: { flex: 1 }, links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, history: { maxHeight: 360 }, historyContent: { gap: 8, paddingVertical: 4 },
  bubble: { maxWidth: '88%', padding: 10, borderRadius: 8, gap: 5, borderWidth: 1, borderColor: palette.border }, incoming: { alignSelf: 'flex-start', backgroundColor: palette.surface }, outgoing: { alignSelf: 'flex-end', backgroundColor: palette.rowSelected },
  message: { color: palette.text, fontSize: 14, lineHeight: 20, flexShrink: 1 }, meta: { color: palette.cardMuted, fontSize: 11, lineHeight: 16 }, muted: { color: palette.cardMuted, fontSize: 12, lineHeight: 18 }, editor: { minHeight: 80, textAlignVertical: 'top' },
  outgoingMeta: { color: palette.cardMeta },
})
