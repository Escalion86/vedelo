import { useCallback, useRef, useState } from 'react'
import { Alert, Linking, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useNavigation } from 'expo-router'
import { usePreventRemove } from '@react-navigation/native'
import { api } from '../../shared/api/client'
import type { Call, Client, Event } from '../../shared/domain/types'
import { getCachedEntity, listCachedEntities } from '../../shared/storage/cache'
import { runSync } from '../../shared/sync/syncEngine'
import { useWorkItemTerminology } from '../../shared/hooks/useWorkItemTerminology'
import { Button, CompactField, Notice, PageHeader, Screen, SectionTitle, StatusChip, Surface } from '../../shared/ui/components'
import { useThemeStyles } from '../../shared/ui/ThemeProvider'
import type { Palette } from '../../shared/ui/theme'
import { callStatusLabel, checkedCall, clientLabel, communicationError, directionLabel, durationLabel, localDateLabel, parseContactDate, phoneDigits, record, safeHttpUrl, serverId, successfulData, suggestedClient, tomorrowAtTen } from './communication'
import { useCommunicationSession } from './useCommunicationSession'

type Result = Exclude<NonNullable<Call['callResult']>, ''>
type Action = 'link' | 'decision' | 'result' | 'ignore' | 'process-recording' | 'analyze'
type Pending = { matches: (call: Call) => boolean; sync: boolean; eventId?: string; taskId?: string; taskDate?: string; navigate?: boolean; note?: string; revision: number }
const results: Record<Result, string> = { answered: 'Ответил', no_answer: 'Не ответил', callback: 'Перезвонить', follow_up: 'Создана задача' }

export const CallDetail = ({ id }: { id: string }) => {
  const session = useCommunicationSession()
  const navigation = useNavigation()
  const terms = useWorkItemTerminology()
  const styles = useThemeStyles(createStyles)
  const path = serverId(id) ? `/mobile/v1/calls/${encodeURIComponent(id)}` : ''
  const [call, setCall] = useState<Call | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [clientsError, setClientsError] = useState('')
  const [eventsError, setEventsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const [nextContactAt, setNextContactAt] = useState(tomorrowAtTen)
  const [dateError, setDateError] = useState('')
  const [dirty, setDirty] = useState(false)
  const draft = useRef({ edited: false, dateEdited: false, note: '', revision: 0 })
  const confirmation = useRef(0)
  const alertOpen = useRef(false)
  const attempted = useRef(new Set<string>())
  const [blocked, setBlocked] = useState<string[]>([])
  const pending = useRef<Pending | null>(null)
  const [needsCheck, setNeedsCheck] = useState(false)

  usePreventRemove(dirty || loading && Boolean(call), ({ data }) => {
    if (session.busy()) return
    const token = session.token()
    const revision = draft.current.revision
    Alert.alert('Есть несохранённые изменения', 'Выйти без сохранения результата звонка?', [
      { text: 'Продолжить редактирование', style: 'cancel' },
      { text: 'Выйти без сохранения', style: 'destructive', onPress: () => { if (session.valid(token) && !session.busy() && revision === draft.current.revision) navigation.dispatch(data.action) } },
    ])
  })
  const readCall = useCallback(async () => checkedCall(successfulData(await api.get<unknown>(path)), id), [id, path])
  const applyCall = useCallback((next: Call) => {
    setCall(next); setVerified(true)
    if (!draft.current.edited) { draft.current.note = next.callResultNote || ''; setNote(draft.current.note) }
  }, [])
  const load = useCallback(async () => {
    const token = session.begin(); if (token === null) return
    confirmation.current += 1; alertOpen.current = false
    setLoading(true); setError(''); setMessage(''); setVerified(false)
    // Auxiliary cache failures cannot turn a real call into a missing call.
    const all = await Promise.allSettled([path ? readCall() : Promise.reject(new Error('invalid_id')), listCachedEntities<Client>('clients'), listCachedEntities<Event>('events')])
    if (session.valid(token)) {
      if (all[0].status === 'fulfilled') applyCall(all[0].value)
      else { setCall(null); setError(path ? communicationError(all[0].reason, 'Не удалось загрузить звонок. Повторите чтение.') : 'Некорректный ID звонка.') }
      if (all[1].status === 'fulfilled') { setClients(all[1].value); setClientsError('') }
      else { setClients([]); setClientsError('Не удалось прочитать клиентов. Связи с клиентом недоступны.') }
      if (all[2].status === 'fulfilled') { setEvents(all[2].value); setEventsError('') }
      else { setEvents([]); setEventsError('Не удалось прочитать работы. Привязка и следующий контакт недоступны.') }
      setLoading(false)
    }
    session.end(token)
  }, [path, readCall, applyCall, session])
  useFocusEffect(useCallback(() => { void load() }, [load]))

  const reconcile = async (token: number) => {
    const expectation = pending.current
    if (!expectation) return
    // Sync is required even when the subsequent read-back fails. Never repeat POST.
    if (expectation.sync) { await runSync(); if (!session.valid(token)) return }
    const next = await readCall()
    if (!session.valid(token)) return
    if (!expectation.matches(next)) throw new Error('unconfirmed_result')
    let cachedEvent: Event | null = null
    if (expectation.eventId) {
      cachedEvent = await getCachedEntity<Event>('events', expectation.eventId)
      if (!session.valid(token)) return
      if (!cachedEvent || cachedEvent._id !== expectation.eventId) throw new Error('event_not_synced')
      if (expectation.taskId && !cachedEvent.additionalEvents?.some((task) => task._id === expectation.taskId && task.date && new Date(task.date).toISOString() === expectation.taskDate)) throw new Error('task_not_synced')
    }
    applyCall(next)
    if (expectation.note !== undefined && draft.current.revision === expectation.revision) {
      if (expectation.taskId) draft.current.dateEdited = false
      draft.current.edited = draft.current.dateEdited; setDirty(draft.current.dateEdited)
      setNote(next.callResultNote || ''); draft.current.note = next.callResultNote || ''
    }
    pending.current = null; setNeedsCheck(false); setMessage('Действие подтверждено сервером.')
    if (expectation.navigate && cachedEvent) router.push(`/events/${encodeURIComponent(cachedEvent._id)}` as never)
  }
  const check = async () => {
    const token = session.begin(); if (token === null) return
    setLoading(true); setError('')
    try { await reconcile(token) }
    catch (reason) { if (session.valid(token)) setError(communicationError(reason, 'Не удалось подтвердить результат или синхронизацию. Повторите проверку, действие повторно не отправляется.')) }
    finally { if (session.valid(token)) setLoading(false); session.end(token) }
  }
  const perform = async (action: Action, body: Record<string, unknown>, snapshot: Call, target?: { kind: 'clients' | 'events'; id: string; clientId?: string | null }) => {
    if (!verified || pending.current || !path) return
    const scheduled = action === 'result' && Boolean(body.nextContactAt)
    const operation = scheduled ? 'schedule' : action === 'decision' ? String(body.decision) : action
    const sensitive = scheduled || ['decision', 'process-recording', 'analyze'].includes(action)
    if (sensitive && attempted.current.has(operation)) return
    const token = session.begin(); if (token === null) return
    const revision = draft.current.revision
    setLoading(true); setError(''); setMessage('')
    let posted = false
    try {
      const fresh = await readCall()
      if (!session.valid(token)) return
      if (fresh.linkedClientId !== snapshot.linkedClientId || fresh.linkedEventId !== snapshot.linkedEventId || fresh.status !== snapshot.status || fresh.updatedAt !== snapshot.updatedAt) throw new Error('changed_call')
      if (target) {
        if (!serverId(target.id)) throw new Error('local_target')
        const current = await getCachedEntity<Client & Event>(target.kind, target.id)
        if (!session.valid(token)) return
        if (!current || current._id !== target.id || (target.kind === 'events' && current.clientId !== target.clientId)) throw new Error('missing_target')
        if (body.clientId) {
          if (!serverId(body.clientId)) throw new Error('local_client')
          const client = await getCachedEntity<Client>('clients', body.clientId)
          if (!session.valid(token)) return
          if (!client || client._id !== body.clientId) throw new Error('missing_client')
        }
      }
      if (scheduled) {
        if (!serverId(fresh.linkedEventId)) throw new Error('event_required')
        const event = await getCachedEntity<Event>('events', fresh.linkedEventId)
        if (!session.valid(token)) return
        if (!event || event._id !== fresh.linkedEventId) throw new Error('event_required')
      }
      if (sensitive) { attempted.current.add(operation); setBlocked([...attempted.current]) }
      posted = true
      const payload = successfulData(await api.post<unknown>(`${path}/${action}`, body, { skipRefresh: true }))
      if (!session.valid(token)) return
      // A successful task/decision POST requires sync even if its DTO is malformed.
      let syncError: unknown
      if (scheduled || body.decision === 'create_event') { try { await runSync() } catch (reason) { syncError = reason } }
      if (!session.valid(token)) return
      const next = checkedCall(record(payload) && 'call' in payload ? payload.call : payload, id)
      const eventId = body.decision === 'create_event'
        ? record(payload) && record(payload.event) && serverId(payload.event._id) ? payload.event._id : undefined
        : scheduled ? fresh.linkedEventId || undefined : undefined
      if ((body.decision === 'create_event' || scheduled) && (!eventId || next.linkedEventId !== eventId)) throw new Error('invalid_event')
      const taskId = scheduled && record(payload) && record(payload.task) && serverId(payload.task._id) ? payload.task._id : undefined
      if (scheduled && (!record(payload) || !record(payload.event) || payload.event._id !== eventId || !taskId || !record(payload.task) || payload.task.date !== body.nextContactAt)) throw new Error('invalid_task')
      pending.current = {
        taskId, taskDate: scheduled ? String(body.nextContactAt) : undefined, sync: scheduled || body.decision === 'create_event', eventId, navigate: body.decision === 'create_event', note: action === 'result' ? String(body.note) : undefined, revision,
        matches: (value) => {
          if (action === 'link') return value.status === 'linked' && (!body.clientId || value.linkedClientId === body.clientId) && (!body.eventId || value.linkedEventId === body.eventId)
          if (action === 'result') return value.callResult === body.result && value.callResultNote === String(body.note).trim() && (!eventId || value.linkedEventId === eventId)
          if (action === 'ignore') return value.status === 'ignored'
          if (action === 'decision') return body.decision === 'create_event' ? value.linkedEventId === eventId && value.eventDecision === 'created' : value.eventDecision === 'no_event'
          return action === 'analyze' ? Boolean(value.aiSummary) : Boolean(value.transcript)
        },
      }
      if (!pending.current.matches(next)) { pending.current = null; throw new Error('invalid_action_result') }
      setNeedsCheck(true)
      if (syncError) throw syncError
      // Already synced above; subsequent retries still sync before checking the cache.
      const needsSync = pending.current.sync; pending.current.sync = false
      try { await reconcile(token) } finally { if (pending.current) pending.current.sync = needsSync }
    } catch (reason) {
      if (session.valid(token)) setError(communicationError(reason, posted ? 'Результат не подтверждён. Обновите звонок или повторите проверку; не повторяйте действие без проверки.' : 'Данные звонка или связи изменились. Обновите звонок и проверьте выбор.'))
    } finally { if (session.valid(token)) setLoading(false); session.end(token) }
  }
  const confirmAction = (title: string, action: Action, body: Record<string, unknown> = {}, target?: { kind: 'clients' | 'events'; id: string; clientId?: string | null }) => {
    if (!call || !verified || session.busy() || alertOpen.current || pending.current) return
    const snapshot = call; const token = session.token(); const revision = draft.current.revision; const confirmId = ++confirmation.current; alertOpen.current = true
    Alert.alert(title, action === 'process-recording' || action === 'analyze' || body.decision === 'create_event' ? 'Операция может использовать платное распознавание и ИИ. Продолжить?' : 'Подтвердить действие для этого звонка?', [
      { text: 'Отмена', style: 'cancel', onPress: () => { if (confirmation.current === confirmId) { confirmation.current += 1; alertOpen.current = false } } },
      { text: 'Подтвердить', onPress: () => { if (confirmation.current !== confirmId) return; confirmation.current += 1; alertOpen.current = false; if (session.valid(token) && (action !== 'result' || revision === draft.current.revision)) void perform(action, body, snapshot, target) } },
    ], { onDismiss: () => { if (confirmation.current === confirmId) { confirmation.current += 1; alertOpen.current = false } } })
  }
  const saveResult = (result: Result) => {
    if (!call || !verified || session.busy()) return
    const schedule = result === 'callback' || result === 'follow_up'
    const date = schedule ? parseContactDate(nextContactAt) : null
    if (schedule && !date) { setDateError('Введите существующую дату и время: ГГГГ-ММ-ДД ЧЧ:ММ'); return }
    setDateError('')
    const body = { result, note: draft.current.note, nextContactAt: date }
    if (schedule) confirmAction('Назначить следующий контакт?', 'result', body)
    else void perform('result', body, call)
  }
  const openUrl = async (url: string) => {
    const token = session.token()
    try { await Linking.openURL(url) } catch { if (session.valid(token)) setError('Не удалось открыть ссылку на устройстве.') }
  }
  const openEntity = async (kind: 'clients' | 'events', entityId: string) => {
    if (!serverId(entityId)) return
    const token = session.begin(); if (token === null) return
    try {
      const current = await getCachedEntity(kind, entityId)
      if (!session.valid(token)) return
      if (current?._id !== entityId) throw new Error('missing_entity')
      router.push(`/${kind}/${encodeURIComponent(entityId)}` as never)
    } catch { if (session.valid(token)) setError('Связанная запись недоступна. Обновите данные.') }
    finally { session.end(token) }
  }
  const matched = call ? suggestedClient(call, clients) : null
  const linkedEvent = call ? events.find((item) => item._id === call.linkedEventId && serverId(item._id)) : null
  const candidates = !clientsError && !eventsError && call && !call.linkedEventId ? events.filter((event) => serverId(event._id) && (!event.clientId || serverId(event.clientId) && clients.some((client) => client._id === event.clientId)) && (!matched || event.clientId === matched._id)).sort((a, b) => (new Date(b.eventDate || 0).getTime() || 0) - (new Date(a.eventDate || 0).getTime() || 0)).slice(0, 5) : []
  const phone = phoneDigits(call?.phone)
  const recording = safeHttpUrl(call?.recordingUrl)
  const fields = call?.aiExtractedFields || {}
  const disabled = loading || !verified || needsCheck
  return <Screen keyboardShouldPersistTaps="handled">
    <PageHeader title={call ? matched ? clientLabel(matched) : fields.clientName || call.phone || 'Звонок' : 'Звонок'} subtitle={call ? localDateLabel(call.startedAt) : undefined} action={call ? <StatusChip label={callStatusLabel(call.status)} tone={call.status === 'failed' ? 'danger' : call.status === 'ready' || call.status === 'linked' ? 'success' : 'neutral'} /> : null} />
    {loading ? <Notice message={call ? 'Проверяем звонок…' : 'Загружаем звонок…'} /> : null}
    {error ? <Notice tone="danger" message={error} /> : null}
    {message ? <Notice tone="success" message={message} /> : null}
    <Button title={error ? 'Повторить чтение звонка' : 'Обновить звонок'} variant="secondary" onPress={() => void load()} disabled={loading || !path} />
    {needsCheck ? <Button title="Проверить результат и синхронизацию" onPress={() => void check()} disabled={loading} /> : null}
    {clientsError ? <Notice tone="warning" message={clientsError} /> : null}
    {eventsError ? <Notice tone="warning" message={eventsError} /> : null}
    {call ? <>
      <View style={styles.actions}><Button title="Позвонить" variant="secondary" disabled={disabled || !phone} onPress={() => { if (phone) void openUrl(`tel:+${phone}`) }} />{call.recordingUrl ? <Button title="Открыть запись" variant="secondary" disabled={disabled || !recording} onPress={() => { if (recording) void openUrl(recording) }} /> : null}</View>
      {call.recordingUrl && !recording ? <Notice tone="warning" message="Ссылка на запись недоступна или имеет небезопасный формат." /> : null}
      <Surface><SectionTitle>Информация</SectionTitle><Text style={styles.text}>{directionLabel(call.direction)} · {durationLabel(call.durationSec)}</Text><Text style={styles.muted}>{call.provider || 'Телефония'}</Text>{call.callResult ? <Text style={styles.text}>Результат: {results[call.callResult]}</Text> : null}</Surface>
      {matched ? <Surface><SectionTitle>{call.linkedClientId ? 'Клиент' : 'Найденный клиент — проверьте совпадение'}</SectionTitle><Button title={clientLabel(matched)} variant="secondary" disabled={disabled} onPress={() => void openEntity('clients', matched._id)} />{!call.linkedClientId ? <Button title="Привязать найденного клиента" variant="secondary" disabled={disabled || !serverId(matched._id)} onPress={() => confirmAction('Привязать клиента?', 'link', { clientId: matched._id }, { kind: 'clients', id: matched._id })} /> : null}</Surface> : call.linkedClientId && !clientsError ? <Notice tone="warning" message="Связанный клиент отсутствует в текущих данных. Переход недоступен." /> : null}
      {linkedEvent ? <Surface><SectionTitle>{terms.labelCapitalized}</SectionTitle><Button title={`${linkedEvent.eventType || terms.labelCapitalized} · ${localDateLabel(linkedEvent.eventDate)}`} variant="secondary" disabled={disabled} onPress={() => void openEntity('events', linkedEvent._id)} /></Surface> : call.linkedEventId && !eventsError ? <Notice tone="warning" message="Связанная работа отсутствует в текущих данных. Обновите синхронизацию." /> : candidates.length ? <Surface><SectionTitle>Привязать к работе</SectionTitle>{candidates.map((event) => <Button key={event._id} title={`${event.eventType || terms.labelCapitalized} · ${localDateLabel(event.eventDate)}`} variant="secondary" disabled={disabled} onPress={() => confirmAction('Привязать работу?', 'link', { eventId: event._id, ...(event.clientId ? { clientId: event.clientId } : {}) }, { kind: 'events', id: event._id, clientId: event.clientId })} />)}</Surface> : null}
      {call.aiSummary ? <Surface><SectionTitle>Кратко по разговору</SectionTitle><Text style={styles.text}>{call.aiSummary}</Text></Surface> : null}
      {Boolean(fields.clientName || fields.eventType || fields.eventDate || fields.eventCity || fields.eventLocation || fields.guestCount || fields.nextContactAt || fields.nextContactReason || fields.objections?.length || fields.budget != null) ? <Surface><SectionTitle>Распознано</SectionTitle>{[
        ['Клиент', fields.clientName], ['Тип', fields.eventType], ['Дата', fields.eventDate ? localDateLabel(fields.eventDate) : ''], ['Город', fields.eventCity], ['Место', fields.eventLocation], ['Гостей', fields.guestCount], ['Бюджет', fields.budget != null ? `${fields.budget} ₽` : ''], ['Следующий контакт', fields.nextContactAt ? localDateLabel(fields.nextContactAt) : ''], ['Причина', fields.nextContactReason], ['Возражения', fields.objections?.join(', ')],
      ].map(([label, value]) => value ? <Text key={label} style={styles.text}>{label}: {value}</Text> : null)}</Surface> : null}
      {call.transcript ? <Surface><SectionTitle>Текст разговора</SectionTitle><Text style={styles.text}>{call.transcript}</Text></Surface> : null}
      {call.processingError ? <Notice tone="danger" message="Обработка звонка не завершена. Проверьте состояние и доступность ИИ в интеграциях." /> : null}
      {call.recordingUrl && !call.transcript ? <Button title="Распознать запись" disabled={disabled || call.status === 'processing' || blocked.includes('process-recording')} onPress={() => confirmAction('Распознать запись?', 'process-recording')} /> : null}
      {call.transcript && !call.aiSummary ? <Button title="Сделать AI-разбор" disabled={disabled || call.status === 'processing' || blocked.includes('analyze')} onPress={() => confirmAction('Сделать AI-разбор?', 'analyze')} /> : null}
      {!call.linkedEventId ? <><Button title="Создать заявку из звонка" disabled={disabled || call.status === 'processing' || blocked.includes('create_event')} onPress={() => confirmAction('Создать заявку из звонка?', 'decision', { decision: 'create_event' })} /><Button title="Без заявки" variant="secondary" disabled={disabled || blocked.includes('no_event')} onPress={() => confirmAction('Отметить звонок без заявки?', 'decision', { decision: 'no_event' })} /></> : null}
      {blocked.length ? <Notice message="Повторное создание задачи/заявки и платная обработка в этом просмотре заблокированы. Проверка и обновление не повторяют операцию." /> : null}
      <Surface><SectionTitle>Результат звонка</SectionTitle><CompactField label="Комментарий" value={note} onChangeText={(value) => { draft.current.note = value; draft.current.edited = true; draft.current.revision += 1; setDirty(true); setNote(value) }} multiline maxLength={1000} editable={verified} /><View style={styles.actions}><Button title="Ответил" variant="secondary" onPress={() => saveResult('answered')} disabled={disabled} /><Button title="Не ответил" variant="secondary" onPress={() => saveResult('no_answer')} disabled={disabled} /></View><CompactField label="Следующий контакт" value={nextContactAt} error={dateError} placeholder="ГГГГ-ММ-ДД ЧЧ:ММ" onChangeText={(value) => { draft.current.edited = true; draft.current.dateEdited = true; draft.current.revision += 1; setDirty(true); setNextContactAt(value) }} editable={verified} /><Text style={styles.muted}>Дата и время в часовом поясе устройства.</Text><View style={styles.actions}><Button title="Перезвонить" onPress={() => saveResult('callback')} disabled={disabled || !linkedEvent || blocked.includes('schedule')} /><Button title="Создать задачу" variant="secondary" onPress={() => saveResult('follow_up')} disabled={disabled || !linkedEvent || blocked.includes('schedule')} /></View>{!linkedEvent ? <Notice message="Для следующего контакта нужна связанная сохранённая работа в текущих данных." /> : null}</Surface>
      <Button title="Игнорировать звонок" variant="secondary" disabled={disabled} onPress={() => confirmAction('Игнорировать звонок?', 'ignore')} />
    </> : null}
  </Screen>
}
const createStyles = (palette: Palette) => StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, text: { color: palette.text, fontSize: 14, lineHeight: 21, flexShrink: 1 }, muted: { color: palette.cardMuted, fontSize: 12, lineHeight: 18 },
})
