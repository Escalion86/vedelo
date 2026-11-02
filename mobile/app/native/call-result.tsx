import { useEffect, useRef, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { api } from '../../src/shared/api/client'
import { ApiError } from '../../src/shared/api/errors'
import { getAuthSessionEpoch } from '../../src/shared/auth/tokenStore'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import type { Event } from '../../src/shared/domain/types'
import { Button, CompactField, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../src/shared/ui/components'
import { beginCallResult, finishCallResult, readCallResult, type AndroidCallResult } from '../../src/shared/native/callResultStore'
import { parseContactDate } from '../../src/features/calls/communication'
import { runSync } from '../../src/shared/sync/syncEngine'

const results = { answered: 'Ответил', no_answer: 'Не ответил', callback: 'Перезвонить', follow_up: 'Договорились о следующем контакте' } as const
export default function CallResultScreen() {
  const params = useLocalSearchParams<{ number?: string; clientId?: string; eventId?: string }>()
  const [phone, setPhone] = useState(params.number || ''), [note, setNote] = useState(''), [date, setDate] = useState(''), [title, setTitle] = useState('Следующий контакт')
  const [eventId, setEventId] = useState(params.eventId || ''), [result, setResult] = useState<AndroidCallResult['result']>('answered'), [direction, setDirection] = useState<AndroidCallResult['direction']>('unknown')
  const [pending, setPending] = useState<AndroidCallResult | null>(null), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  const alive = useRef(true), lock = useRef(false)
  const events = useCachedEntities<Event>('events')
  useEffect(() => {
    alive.current = true
    const epoch = getAuthSessionEpoch()
    readCallResult().then(value => { if (alive.current && epoch === getAuthSessionEpoch()) { setPending(value); setReady(true) } }).catch(() => { if (alive.current) setError('Не удалось прочитать незавершённый результат. Откройте экран заново.') })
    return () => { alive.current = false }
  }, [])
  const save = async () => {
    if (lock.current || !ready || saved) return
    const nextContactAt = date ? parseContactDate(date) : null
    if (!pending && date && (!nextContactAt || !eventId)) { setError('Выберите работу и дату контакта в формате ГГГГ-ММ-ДД ЧЧ:ММ'); return }
    const epoch = getAuthSessionEpoch(), current = () => alive.current && epoch === getAuthSessionEpoch()
    lock.current = true; setBusy(true); setError('')
    let attempt = pending
    try {
      attempt = attempt || await beginCallResult({ phone, direction, result, note, clientId: params.clientId || null, eventId: eventId || null, nextContactAt, nextContactTitle: nextContactAt ? title : '' })
      if (!current()) return
      setPending(attempt)
      const { requestId, phone: number, direction: way, result: outcome, note: memo, clientId, eventId: linked, nextContactAt: at, nextContactTitle: taskTitle } = attempt
      const response = await api.post<{ success: boolean; data: { requestId: string; pending: boolean } }>('/calls/android', { requestId, phone: number, direction: way, result: outcome, note: memo, clientId, eventId: linked, nextContactAt: at, nextContactTitle: taskTitle })
      if (!current()) return
      if (!response.success || response.data?.requestId !== attempt.requestId || response.data.pending) throw Error('UNCONFIRMED')
      await finishCallResult(attempt.requestId)
      if (current()) { setPending(null); setSaved(true); void runSync().catch(() => undefined) }
    } catch (reason) {
      if (current()) {
        if (reason instanceof ApiError && reason.code === 'ANDROID_RESULT_REJECTED' && attempt) { await finishCallResult(attempt.requestId); if (current()) setPending(null) }
        if (current()) setError(reason instanceof ApiError && reason.status < 500 ? reason.message : 'Результат не подтверждён. Повторите сохранённую попытку — дубликаты звонка и задачи не создаются.')
      }
    } finally { lock.current = false; if (current()) setBusy(false) }
  }
  const disabled = busy || !ready || Boolean(pending) || saved
  return <Screen><PageHeader title="Итог телефонного звонка" />
    <Notice message="Сохраняется только ваш результат и заметка. Запись разговора и длительность не определяются." />
    {error ? <Notice tone="danger" message={error} /> : null}
    {saved ? <><Notice tone="success" message="Итог сохранён и доступен в PWA." /><Button title="Открыть сохранённые итоги" onPress={() => router.replace('/native/call-results')} /></> : null}
    {pending ? <Surface><SectionTitle>Незавершённое сохранение</SectionTitle><Notice message={`${pending.phone} · ${results[pending.result]}${pending.note ? `\n${pending.note}` : ''}${pending.nextContactAt ? `\nСледующий контакт: ${new Date(pending.nextContactAt).toLocaleString('ru-RU')}` : ''}`} /></Surface> : <>
      <CompactField label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!disabled} />
      {([['unknown', 'Направление не указано'], ['incoming', 'Входящий'], ['outgoing', 'Исходящий']] as const).map(([key, label]) => <Button key={key} title={label} variant={direction === key ? 'primary' : 'secondary'} disabled={disabled} onPress={() => setDirection(key)} />)}
      {Object.entries(results).map(([key, label]) => <Button key={key} title={label} variant={result === key ? 'primary' : 'secondary'} disabled={disabled} onPress={() => setResult(key as AndroidCallResult['result'])} />)}
      <CompactField label="Заметка" value={note} onChangeText={setNote} multiline maxLength={1000} editable={!disabled} />
      <SectionTitle>Связанная работа</SectionTitle><Button title="Без привязки к работе" variant={!eventId ? 'primary' : 'secondary'} disabled={disabled} onPress={() => setEventId('')} />
      {(events.data || []).filter(event => !event._id.startsWith('local-') && ['draft', 'active'].includes(event.status) && (!params.clientId || event.clientId === params.clientId || event.otherContacts?.some(contact => contact.clientId === params.clientId))).slice(0, 50).map(event => <Button key={event._id} title={`${event.eventType || 'Работа'} · ${event.eventDate ? new Date(event.eventDate).toLocaleDateString('ru-RU') : 'без даты'}`} variant={eventId === event._id ? 'primary' : 'secondary'} disabled={disabled} onPress={() => setEventId(event._id)} />)}
      <CompactField label="Следующий контакт (необязательно)" placeholder="ГГГГ-ММ-ДД ЧЧ:ММ" value={date} onChangeText={setDate} editable={!disabled} />
      <Notice message="Дата и время в часовом поясе устройства. Для создания задачи выберите связанную работу." />
      {date ? <CompactField label="Название задачи" value={title} onChangeText={setTitle} maxLength={200} editable={!disabled} /> : null}
    </>}
    {!saved ? <Button title={pending ? 'Повторить сохранённую попытку' : 'Сохранить итог'} disabled={busy || !ready} loading={busy} onPress={() => void save()} /> : null}
  </Screen>
}
