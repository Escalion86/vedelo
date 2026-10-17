import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { modalsFuncAtom } from '@state/atoms'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import eventsAtom from '@state/atoms/eventsAtom'
import IconActionButton from '@components/IconActionButton'
import AddIconButton from '@components/AddIconButton'
import MutedText from '@components/MutedText'
import Notice from '@components/Notice'
import { faPencilAlt, faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { prepareEventTypeEdit } from '@helpers/eventTypeList.mjs'
import { queryKeys } from '@helpers/queryKeys'
import useSnackbar from '@helpers/useSnackbar'
import listItemNameFunc from './listItemNameFunc'

const request = async (body) => {
  const response = await fetch('/api/event-types', body ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Не удалось сохранить список')
  return result
}

export const EventTypesModal = ({ closeModal, setOnConfirmFunc, setOnShowOnCloseConfirmDialog, setDisableConfirm }) => {
  const modals = useAtomValue(modalsFuncAtom)
  const setSettings = useSetAtom(siteSettingsAtom)
  const setEvents = useSetAtom(eventsAtom)
  const cache = useQueryClient()
  const snackbar = useSnackbar()
  const query = useQuery({ queryKey: ['event-type-list'], queryFn: () => request(), staleTime: 0, refetchOnWindowFocus: false })
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const source = query.data
  const base = source?.pending?.plan.base || source?.items
  const rows = useMemo(() => draft || (source?.pending
    ? source.pending.plan.next.map(name => ({ name, original: source.pending.plan.renames.find(x => x.to === name)?.from || (base.includes(name) ? name : null) }))
    : (source?.items || []).map(name => ({ original: name, name }))), [draft, source, base])
  const changed = Boolean(source?.pending) || (draft !== null && JSON.stringify(rows.map(x => x.name)) !== JSON.stringify(source?.items))
  const handleSave = useCallback(async () => {
    if (locked.current || !source) return
    locked.current = true; setBusy(true); setError('')
    try {
      const plan = prepareEventTypeEdit(base, rows)
      const result = await request({ base, rows })
      await cache.cancelQueries({ queryKey: queryKeys.siteSettings })
      const patch = current => ({ ...current, custom: { ...current?.custom, eventTypes: result.items } })
      setSettings(patch)
      cache.setQueryData(queryKeys.siteSettings, current => current ? patch(current) : undefined)
      cache.setQueryData(['event-type-list'], result)
      if (plan.renames.length) {
        const rename = value => plan.renames.find(x => x.from === value)?.to || value
        setEvents(current => Array.isArray(current) ? current.map(event => ({ ...event, eventType: rename(event.eventType) })) : current)
        window.dispatchEvent(new CustomEvent('vedelo:event-types-renamed', { detail: plan.renames }))
      }
      await Promise.all(['events', 'event', 'clientRelations', 'statistics', 'type-usage'].map(key => cache.invalidateQueries({ queryKey: [key] })))
      snackbar.success('Типы событий сохранены')
      closeModal()
    } catch (cause) { setError(cause.message || 'Не удалось сохранить список') }
    finally { locked.current = false; setBusy(false) }
  }, [source, base, rows, cache, setSettings, setEvents, snackbar, closeModal])
  useEffect(() => {
    setDisableConfirm(!source || !changed || busy)
    setOnShowOnCloseConfirmDialog(changed)
    setOnConfirmFunc(handleSave)
  }, [source, changed, busy, handleSave, setDisableConfirm, setOnConfirmFunc, setOnShowOnCloseConfirmDialog])
  const edit = (index = -1) => modals.add(listItemNameFunc({
    title: index < 0 ? 'Добавить тип события' : 'Изменить название типа события',
    initialName: rows[index]?.name || '',
    maxLength: 200,
    onSave: name => {
      const next = index < 0 ? [...rows, { original: null, name }] : rows.map((row, i) => i === index ? { ...row, name } : row)
      prepareEventTypeEdit(base, next)
      setDraft(next)
    },
  }))
  const disabled = busy || !source || Boolean(source.pending)
  return <div className="flex min-w-0 flex-col gap-3 p-3">
    <div className="flex items-center justify-between gap-3"><MutedText>Переименование применяется к сохранённым карточкам после нажатия «Сохранить».</MutedText><AddIconButton title="Добавить тип события" disabled={disabled} onClick={() => edit()} /></div>
    {source?.pending ? <Notice tone="warning">Предыдущее изменение не завершено. Нажмите «Сохранить», чтобы продолжить.</Notice> : null}
    {error || query.error ? <Notice tone="error" role="alert">{error || query.error.message}{query.error ? <button className="ml-2 cursor-pointer underline" onClick={() => query.refetch()}>Повторить загрузку</button> : null}</Notice> : null}
    {query.isPending ? <Notice>Загрузка типов событий…</Notice> : null}
    <div className="divide-y divide-gray-200 rounded border border-gray-200">
      {rows.map((row, index) => <div key={row.original || row.name} className="flex min-w-0 items-center justify-between gap-3 p-3">
        <div className="min-w-0 flex-1"><div className="break-words text-sm font-medium text-gray-800">{row.name}</div><MutedText>Использований: {row.original ? (source?.usage[row.original] || 0) + (source?.pending && row.original !== row.name ? (source?.usage[row.name] || 0) : 0) : 0}</MutedText></div>
        <div className="flex shrink-0 gap-1">
          <IconActionButton icon={faPencilAlt} variant="warning" title={`Переименовать: ${row.name}`} disabled={disabled} onClick={() => edit(index)} />
          <IconActionButton icon={faTrashAlt} variant="danger" title={`Удалить из списка: ${row.name}`} disabled={disabled} onClick={() => modals.confirm({ title: 'Удалить тип из списка?', text: `«${row.name}». Сохранённые карточки (${source?.usage[row.original] || 0}) останутся без изменений.`, onConfirm: () => setDraft(rows.filter((_, i) => i !== index)) })} />
        </div>
      </div>)}
      {source && !rows.length ? <div className="p-3"><MutedText>Типов пока нет</MutedText></div> : null}
    </div>
  </div>
}

export default function eventTypesFunc() {
  return { title: 'Список: Типы события', confirmButtonName: 'Сохранить', Children: EventTypesModal }
}
