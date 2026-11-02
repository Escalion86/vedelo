import { useCallback, useRef, useState } from 'react'
import { Alert, Pressable, Text } from 'react-native'
import * as Crypto from 'expo-crypto'
import { router, useFocusEffect } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../shared/auth/AuthProvider'
import { getAuthSessionEpoch } from '../../shared/auth/tokenStore'
import { runSync } from '../../shared/sync/syncEngine'
import { Button, CompactField, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useTheme } from '../../shared/ui/ThemeProvider'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import { calendarRange, connectImportCalendar, disconnectImportCalendar, getCalendarImportStatus, getImportCalendars, importCalendarBatch, previewImportCalendar, selectImportCalendar, type CalendarImportStatus, type CalendarPreview, type CalendarResult, type CalendarSource } from './calendarImportApi'
import { readPendingCalendarImport, savePendingCalendarImport, type PendingCalendarImport } from './calendarImportStore'

export function CalendarImportSection() {
  const { user } = useAuth()
  return <CalendarImportForm key={`${user?.tenantId}:${user?._id}`} />
}
function CalendarImportForm() {
  const { user } = useAuth(), { palette } = useTheme(), query = useQueryClient()
  const [status, setStatus] = useState<CalendarImportStatus | null>(null), [calendars, setCalendars] = useState<CalendarSource[]>([])
  const [preview, setPreview] = useState<CalendarPreview | null>(null), [selected, setSelected] = useState<string[]>([])
  const [pending, setPending] = useState<PendingCalendarImport | null>(null), [results, setResults] = useState<CalendarResult[]>([])
  const [cost, setCost] = useState<number | null>(null)
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10)), [to, setTo] = useState(() => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10))
  const life = useRef({ active: false, epoch: 0 }), lock = useRef(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const task = async (work: (current: () => boolean) => Promise<void>) => {
    if (!life.current.active || lock.current || !user?._id) return
    const epoch = life.current.epoch, auth = getAuthSessionEpoch()
    const current = () => life.current.active && epoch === life.current.epoch && auth === getAuthSessionEpoch()
    lock.current = true; setBusy(true); setError('')
    try { await work(current) }
    catch { if (current()) setError('Действие не подтверждено. Проверьте подключение, доступ тарифа и обновите состояние. Незавершённый импорт можно продолжить без дублей.') }
    finally {
      lock.current = false
      if (life.current.active) setBusy(false)
    }
  }
  const read = async (current: () => boolean) => {
    const [state, unfinished] = await Promise.all([getCalendarImportStatus(), readPendingCalendarImport()])
    if (!current()) return
    setStatus(state); setPending(unfinished)
    if (unfinished) { setPreview(unfinished.preview); setSelected(unfinished.eventIds) }
    const sources = state.connected && state.allowAi && state.allowCalendarSync ? await getImportCalendars() : []
    if (current()) setCalendars(sources)
  }
  useFocusEffect(useCallback(() => {
    life.current.active = true; ++life.current.epoch; setBusy(lock.current)
    void task(read)
    return () => { life.current.active = false; ++life.current.epoch }
    // Identity remounts the form; drafts never restart the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]))
  const scan = () => {
    let range
    try { range = calendarRange(from, to) } catch (e) { setError((e as Error).message); return }
    void task(async current => {
      const data = await previewImportCalendar(range)
      if (!current()) return
      setPreview(data); setSelected(data.candidates.filter(c => !c.alreadyImported && !c.canceled).slice(0, data.maxEvents).map(c => c.id)); setResults([]); setCost(null)
    })
  }
  const estimated = preview ? preview.candidates.filter(c => selected.includes(c.id) && c.needsAi).length * preview.quote.costPerEvent : 0
  const eligible = status?.allowAi && status.allowCalendarSync && status.connected && status.calendarId
  const insufficient = !preview?.quote.platformConfigured || (preview.quote.billingMode === 'artistcrm' && estimated > 0 && (preview.quote.balance ?? 0) <= estimated)
  const start = () => {
    if (busy || !preview || !selected.length || !eligible || (!pending && insufficient)) return
    let range
    try { range = pending || calendarRange(from, to) } catch (e) { setError((e as Error).message); return }
    const request: PendingCalendarImport = pending || { ...range, _id: 'pending', eventIds: selected, groupId: Crypto.randomUUID(), calendarId: preview.calendarId, preview }
    const epoch = life.current.epoch, auth = getAuthSessionEpoch()
    Alert.alert(pending ? 'Продолжить импорт?' : 'Подтвердить импорт?', `Будет обработано записей: ${request.eventIds.length}. Оценка ИИ: ${estimated.toFixed(2)} ₽. ${preview.quote.billingMode === 'user_key' ? 'Расходы по собственному ключу оплачиваются провайдеру.' : 'Итоговая стоимость зависит от объёма текста.'} Будут созданы заявки для ручной проверки.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Подтвердить', onPress: () => {
        if (epoch !== life.current.epoch || auth !== getAuthSessionEpoch()) return
        void task(async current => {
          await savePendingCalendarImport(request, current)
          if (!current()) return
          setPending(request); setResults([])
          const state = await getCalendarImportStatus()
          if (!current()) return
          setStatus(state)
          if (!state.connected || state.calendarId !== request.calendarId || !state.allowAi || !state.allowCalendarSync) throw new Error('CONNECTION_CHANGED')
          const rows: CalendarResult[] = []
          let remaining = [...request.eventIds]
          for (let i = 0; i < request.eventIds.length; i += request.preview.batchSize) {
            if (!current()) return
            const reply = await importCalendarBatch({ ...request, eventIds: request.eventIds.slice(i, i + request.preview.batchSize) })
            if (!current()) return
            rows.push(...reply.results); setResults([...rows]); setCost(reply.actualCost)
            const done = new Set(reply.results.filter(r => ['created', 'duplicate', 'canceled'].includes(r.status)).map(r => r.id))
            remaining = remaining.filter(id => !done.has(id))
            const next = remaining.length ? { ...request, eventIds: remaining } : null
            await savePendingCalendarImport(next, current)
            if (!current()) return
            setPending(next); setSelected(remaining)
            if (reply.results.some(r => !done.has(r.id))) break
          }
          if (remaining.length) setError('Некоторые записи не импортированы. Проверьте результат и подтвердите продолжение позже.')
          else { setSelected([]); setPreview(null) }
          await runSync({ fullPull: true })
          if (current()) {
            await query.invalidateQueries({ queryKey: ['cached-entities', 'events'] })
            if (current()) await query.invalidateQueries({ queryKey: ['cached-entities', 'clients'] })
          }
        })
      } },
    ])
  }
  return <Surface>
    <SectionTitle help={getFieldHelp('import.google')}>Импорт из Google Calendar</SectionTitle>
    <Notice message="Подключите календарь-источник, проверьте список и стоимость. Импорт создаёт заявки для проверки. Подключение для импорта отдельно от обычной синхронизации Google." />
    {error ? <Notice tone="warning" message={error} /> : null}
    <Button title="Обновить состояние Google-импорта" variant="secondary" disabled={busy} loading={busy} onPress={() => void task(read)} />
    {status && (!status.allowAi || !status.allowCalendarSync) ? <Notice message="Нужен тариф с Google Calendar и ИИ." /> : null}
    {status && !status.connected ? <Button title="Подключить Google для импорта" disabled={busy || !status.allowAi || !status.allowCalendarSync} onPress={() => void task(async current => { await connectImportCalendar(current); if (current()) await read(current) })} /> : null}
    {status?.connected ? <>
      <Text style={{ color: palette.text }}>Календарь: {status.calendarName || status.calendarId || 'не выбран'}</Text>
      {!pending ? calendars.map(c => <Button key={c.id} title={`${c.id === status.calendarId ? '✓ ' : ''}${c.summary || c.id}`} variant="secondary" disabled={busy || c.id === status.calendarId} onPress={() => void task(async current => { await selectImportCalendar(c.id); if (current()) { setPreview(null); await read(current) } })} />) : null}
      {!pending ? <Button title="Отключить Google-импорт" variant="danger" disabled={busy} onPress={() => {
        const epoch = life.current.epoch
        Alert.alert('Отключить Google-импорт?', 'Сохранённые заявки останутся в CRM.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Отключить', onPress: () => { if (epoch === life.current.epoch) void task(async current => { await disconnectImportCalendar(); if (current()) { setPreview(null); await read(current) } }) } }])
      }} /> : null}
    </> : null}
    {pending ? <>
      <Notice tone="warning" message={`Сохранён незавершённый импорт: ${pending.eventIds.length} записей. Продолжение выполняется только после подтверждения.`} />
      <Button title="Завершить без оставшихся записей" variant="secondary" disabled={busy} onPress={() => {
        const epoch = life.current.epoch
        Alert.alert('Закрыть незавершённый импорт?', 'Уже созданные заявки и оплаченные результаты останутся. Оставшиеся записи сейчас обрабатываться не будут.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Завершить', onPress: () => { if (epoch === life.current.epoch) void task(async current => { await savePendingCalendarImport(null, current); if (current()) { setPending(null); setPreview(null); setSelected([]) } }) } }])
      }} />
    </> : null}
    {eligible && !pending ? <>
      <CompactField label="Начало периода (ГГГГ-ММ-ДД)" value={from} editable={!busy} onChangeText={value => { setFrom(value); setPreview(null) }} />
      <CompactField label="Конец периода включительно (ГГГГ-ММ-ДД)" value={to} editable={!busy} onChangeText={value => { setTo(value); setPreview(null) }} />
      <Button title="Посмотреть события Google" disabled={busy} onPress={scan} />
    </> : null}
    {preview ? <>
      <Text style={{ color: palette.text }}>Выбрано: {selected.length} · оценка ИИ: {estimated.toFixed(2)} ₽</Text>
      {!pending && insufficient ? <Notice tone="warning" message="Проверьте настройки ИИ и баланс перед импортом." /> : null}
      {preview.candidates.map(c => <Pressable key={c.id} accessibilityRole="checkbox" accessibilityLabel={c.title} accessibilityState={{ checked: selected.includes(c.id), disabled: busy || !!pending || c.alreadyImported || c.canceled }} disabled={busy || !!pending || c.alreadyImported || c.canceled} style={{ minHeight: 48, paddingVertical: 10 }} onPress={() => setSelected(ids => ids.includes(c.id) ? ids.filter(id => id !== c.id) : ids.length < preview.maxEvents ? [...ids, c.id] : ids)}>
        <Text style={{ color: palette.text }}>{selected.includes(c.id) ? '☑' : '☐'} {c.title}</Text>
        <Text style={{ color: palette.cardMuted }}>{c.eventDate}{c.alreadyImported ? ' · Уже импортировано' : c.canceled ? ' · Отменено' : ''}</Text>
        {c.location ? <Text style={{ color: palette.cardMuted }}>{c.location}</Text> : null}
        {c.descriptionPreview ? <Text style={{ color: palette.cardMuted }}>{c.descriptionPreview}</Text> : null}
      </Pressable>)}
      <Button title={pending ? 'Продолжить Google-импорт' : 'Импортировать выбранные события'} disabled={busy || !selected.length || !eligible || !pending && insufficient} onPress={start} />
    </> : null}
    {cost !== null ? <Text style={{ color: palette.text }}>Списано в Ведело за этот импорт: {cost.toFixed(2)} ₽</Text> : null}
    {results.map(r => <Surface key={r.id}>
      <Text style={{ color: palette.text }}>{r.title} · {({ created: 'Заявка создана', duplicate: 'Уже импортировано', canceled: 'Отменено', limit: 'Лимит тарифа', invalid_date: 'Проверьте дату', balance_error: 'Недостаточно средств', error: 'Не завершено' } as Record<string, string>)[r.status] || 'Требуется проверка'}</Text>
      {r.warnings?.map((text, i) => <Notice key={i} tone="warning" message={text} />)}
      {r.error ? <Notice tone="warning" message={r.error} /> : null}
      {r.eventId && /^[a-f\d]{24}$/i.test(r.eventId) ? <Button title="Проверить заявку" variant="secondary" onPress={() => router.push(`/events/${r.eventId}` as never)} /> : null}
    </Surface>)}
  </Surface>
}
