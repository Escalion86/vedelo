import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../src/shared/auth/AuthProvider'
import { useAppLock } from '../../src/shared/auth/AppLockProvider'
import { getAuthSessionEpoch } from '../../src/shared/auth/tokenStore'
import { listCachedEntities } from '../../src/shared/storage/cache'
import { runSync } from '../../src/shared/sync/syncEngine'
import type { Client, Event } from '../../src/shared/domain/types'
import { clientName } from '../../src/features/clients/clientList'
import { fileSize } from '../../src/features/documents/documentUi'
import { device, deviceSession } from '../../src/shared/native/device'
import { queueSharedFiles, readIncomingShare, type IncomingShare } from '../../src/shared/native/share'
import { setSharedDraft } from '../../src/shared/native/shareDraft'
import { Button, CompactField, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../src/shared/ui/components'
import { useTheme } from '../../src/shared/ui/ThemeProvider'
import { useWorkItemTerminology } from '../../src/shared/hooks/useWorkItemTerminology'

export default function ShareScreen() {
  const { shareId } = useLocalSearchParams<{ shareId?: string }>()
  const { user, authenticated } = useAuth(), { locked } = useAppLock()
  return <SharePreview key={`${user?.tenantId}:${user?._id}:${shareId}`} shareId={shareId || ''} allowed={authenticated && !locked} />
}
function SharePreview({ shareId, allowed }: { shareId: string; allowed: boolean }) {
  const { palette } = useTheme(), terms = useWorkItemTerminology()
  const [share, setShare] = useState<IncomingShare | null>(null), [text, setText] = useState('')
  const [selected, setSelected] = useState<string[]>([]), [kind, setKind] = useState<'events' | 'clients'>('events')
  const [clients, setClients] = useState<Client[]>([]), [events, setEvents] = useState<Event[]>([])
  const [target, setTarget] = useState(''), [search, setSearch] = useState(''), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const active = useRef(true), access = useRef(allowed), working = useRef(false)
  access.current = allowed
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    if (!allowed || share) return
    let alive = true
    const epoch = getAuthSessionEpoch()
    Promise.all([readIncomingShare(shareId), listCachedEntities<Client>('clients'), listCachedEntities<Event>('events')])
      .then(([data, clients, events]) => {
        if (!alive || !access.current || epoch !== getAuthSessionEpoch()) return
        setShare(data); setText(data.text); setClients(clients); setEvents(events)
      }).catch(() => { if (alive) setError('Данные больше недоступны. Отправьте их через «Поделиться» ещё раз. После перезапуска приложения передача не сохраняется.') })
    return () => { alive = false }
  }, [allowed, share, shareId])
  const create = (action: 'event' | 'client' | 'ai') => {
    const session = deviceSession()
    if (!allowed || busy || !share || !text.trim() || !session) return
    setSharedDraft({ id: share.id, generation: session.generation, text, mode: action === 'ai' ? 'text' : 'manual' })
    if (action === 'ai') { router.push(`/events/assistant?mode=text&shareDraft=${share.id}` as never); return }
    router.push(`${action === 'client' ? '/clients' : '/events'}/edit/new?shareDraft=${share.id}${action === 'client' ? '' : '&initialStatus=draft'}` as never)
  }
  const saveFiles = async () => {
    if (!allowed || working.current || !share) return
    working.current = true; setBusy(true); setError(''); setMessage('')
    const epoch = getAuthSessionEpoch()
    const current = () => active.current && access.current && epoch === getAuthSessionEpoch()
    try {
      await queueSharedFiles(share, selected, kind, target, current)
      if (!current()) return
      setSelected([]); setMessage('Вложения добавлены в очередь отправки. Их состояние доступно в документах выбранной записи.')
      void runSync().catch(() => undefined)
    } catch { if (current()) setError('Добавление не подтверждено. Проверьте доступ и повторите действие: уже поставленные в очередь файлы не дублируются.') }
    finally { working.current = false; if (active.current) setBusy(false) }
  }
  const close = async () => {
    if (busy) return
    const session = deviceSession()
    if (session && share) await device?.discardShare?.(session.generation, share.id).catch(() => undefined)
    router.replace('/(tabs)')
  }
  const records = (kind === 'clients' ? clients.map(item => ({ id: item._id, label: clientName(item) })) : events.map(item => ({ id: item._id, label: `${item.eventType || terms.labelCapitalized} · ${item.description || ''}` })))
    .filter(item => /^[a-f\d]{24}$/i.test(item.id) && item.label.toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU'))).slice(0, 40)
  return <Screen><PageHeader title="Получено через «Поделиться»" />
    {!allowed ? <Notice message="Войдите и разблокируйте приложение, чтобы продолжить." /> : <>
      {error ? <Notice tone="danger" message={error} /> : null}
      {message ? <Notice tone="success" message={message} /> : null}
      {share?.problem ? <Notice tone="warning" message={share.problem} /> : null}
      {share && !share.text && !share.files.length ? <Notice message="В передаче нет поддерживаемого текста или файлов." /> : null}
      {share?.text ? <Surface>
        <SectionTitle>Текст</SectionTitle>
        <CompactField label="Проверьте и исправьте текст" value={text} onChangeText={setText} multiline maxLength={20_000} editable={!busy} />
        <Button title="Создать заявку с этим описанием" variant="secondary" disabled={busy || !text.trim()} onPress={() => create('event')} />
        <Button title="Создать клиента с этим комментарием" variant="secondary" disabled={busy || !text.trim()} onPress={() => create('client')} />
        <Button title="Подготовить текст для ИИ" variant="secondary" disabled={busy || !text.trim()} onPress={() => create('ai')} />
        <Notice message="Откроется редактируемая форма. Сохранение и платный разбор ИИ запускаются отдельным нажатием." />
      </Surface> : null}
      {share?.files.length ? <Surface>
        <SectionTitle>Вложения</SectionTitle>
        <Notice message="Выберите файлы и сохранённую запись. Добавление использует ваш текущий доступ к документам." />
        {share.files.map(file => <Pressable key={file.id} accessibilityRole="checkbox" accessibilityLabel={`${file.name}, ${fileSize(file.size)}`} accessibilityState={{ checked: selected.includes(file.id), disabled: busy }} disabled={busy} onPress={() => setSelected(current => current.includes(file.id) ? current.filter(id => id !== file.id) : [...current, file.id])} style={{ minHeight: 48, paddingVertical: 10 }}>
          <Text style={{ color: palette.text }}>{selected.includes(file.id) ? '☑' : '☐'} {file.name} · {fileSize(file.size)}</Text>
          {file.preview?.startsWith('data:image/jpeg;base64,') ? <Image source={{ uri: file.preview }} style={{ width: 120, height: 120 }} resizeMode="contain" accessibilityLabel={`Предпросмотр ${file.name}`} /> : null}
          <Text style={{ color: palette.cardMuted }}>{file.mimeType}</Text>
        </Pressable>)}
        <View style={{ gap: 8 }}>
          <Button title={terms.plural} variant="secondary" disabled={busy} onPress={() => { setKind('events'); setTarget(''); setMessage('') }} />
          <Button title="Клиенты" variant="secondary" disabled={busy} onPress={() => { setKind('clients'); setTarget(''); setMessage('') }} />
        </View>
        <CompactField label="Найти запись" value={search} onChangeText={setSearch} editable={!busy} />
        {records.map(record => <Pressable key={record.id} accessibilityRole="radio" accessibilityLabel={record.label} accessibilityState={{ checked: target === record.id, disabled: busy }} disabled={busy} onPress={() => { setTarget(record.id); setMessage('') }} style={{ minHeight: 48, paddingVertical: 10 }}><Text style={{ color: palette.text }}>{target === record.id ? '●' : '○'} {record.label}</Text></Pressable>)}
        {!records.length ? <Notice message="Сохранённых записей в локальной копии нет. Сначала создайте или синхронизируйте нужную запись." /> : null}
        <Button title={`Добавить выбранные файлы (${selected.length})`} disabled={busy || !selected.length || !target} loading={busy} onPress={saveFiles} />
        {message && target ? <Button title="Открыть документы записи" variant="secondary" onPress={() => router.push(`/${kind}/${target}/documents` as never)} /> : null}
      </Surface> : null}
    </>}
    <Button title="Закрыть" variant="secondary" onPress={close} disabled={busy} />
  </Screen>
}
