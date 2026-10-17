'use client'

import { useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import { faPencilAlt, faEye, faEyeSlash, faArrowUp, faArrowDown } from '@fortawesome/free-solid-svg-icons'
import IconActionButton from './IconActionButton'
import AddIconButton from './AddIconButton'
import Notice from './Notice'
import MutedText from './MutedText'
import { useClientTypes } from '@helpers/useClientTypes'
import { validateClientTypes } from '@helpers/clientTypes.mjs'
import useTypeUsage from '@helpers/useTypeUsage'
import useSnackbar from '@helpers/useSnackbar'
import listItemNameFunc from '@layouts/modals/modalsFunc/listItemNameFunc'

export default function ClientTypesEditor({ onAdded }) {
  const snackbar = useSnackbar()
  const modals = useAtomValue(modalsFuncAtom)
  const query = useClientTypes()
  const usage = useTypeUsage()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const items = query.data?.items || []
  const change = async (action, value, argument) => {
    if (lock.current || !query.data) throw new Error('Дождитесь загрузки списка')
    lock.current = true
    setBusy(true)
    setError('')
    try {
      let next = items.map((item) => ({ ...item }))
      if (action === 'add') next.push({ value, name: argument, hidden: false })
      if (action === 'rename') next = next.map((item) => item.value === value ? { ...item, name: argument } : item)
      if (action === 'hide') next = next.map((item) => item.value === value ? { ...item, hidden: !item.hidden } : item)
      if (action === 'move') {
        const index = next.findIndex((item) => item.value === value)
        const [item] = next.splice(index, 1)
        next.splice(index + argument, 0, item)
      }
      await query.save(validateClientTypes(next, items), query.data.version)
      snackbar.success('Типы клиентов сохранены')
      if (action === 'add') onAdded?.(value)
    } catch (cause) {
      setError(cause.message || 'Не удалось сохранить типы')
      throw cause
    } finally { lock.current = false; setBusy(false) }
  }
  const rename = (item) => modals.add(listItemNameFunc({
    title: item ? 'Изменить название типа клиента' : 'Добавить тип клиента',
    initialName: item?.name || '',
    onSave: (name) => change(item ? 'rename' : 'add', item?.value || `custom_${crypto.randomUUID()}`, name),
  }))
  const disabled = busy || query.isFetching || !query.data
  return <div className="flex min-w-0 flex-col gap-3 p-3">
    <div className="flex items-center justify-between gap-3">
      <MutedText>Изменения сохраняются сразу. Скрытые типы остаются в карточках.</MutedText>
      <AddIconButton title="Добавить тип клиента" disabled={disabled} onClick={() => rename()} />
    </div>
    {query.isPending ? <Notice>Загрузка типов клиентов…</Notice> : null}
    {error || query.error || usage.error ? <Notice tone="error" role="alert">{error || query.error?.message || usage.error?.message}<button className="ml-2 cursor-pointer underline" onClick={() => { setError(''); void query.refetch(); void usage.refetch() }}>Повторить загрузку</button></Notice> : null}
    <div className="divide-y divide-gray-200 rounded border border-gray-200">
      {items.map((item, index) => <div key={item.value} className="flex min-w-0 items-center justify-between gap-2 p-2">
        <div className="min-w-0 flex-1">
          <div className="break-words text-sm font-medium text-gray-800">{item.name}{item.hidden ? ' (скрыт)' : ''}</div>
          <MutedText>Использований: {usage.data ? (usage.data.clients[item.value] || 0) : '…'}</MutedText>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconActionButton icon={faPencilAlt} variant="warning" title={`Переименовать: ${item.name}`} disabled={disabled} onClick={() => rename(item)} />
          <IconActionButton icon={item.hidden ? faEye : faEyeSlash} title={`${item.hidden ? 'Показать' : 'Скрыть'}: ${item.name}`} disabled={disabled || item.value === 'none'} onClick={() => { void change('hide', item.value).catch(() => {}) }} />
          <IconActionButton icon={faArrowUp} title={`Выше: ${item.name}`} disabled={disabled || index === 0} onClick={() => { void change('move', item.value, -1).catch(() => {}) }} />
          <IconActionButton icon={faArrowDown} title={`Ниже: ${item.name}`} disabled={disabled || index === items.length - 1} onClick={() => { void change('move', item.value, 1).catch(() => {}) }} />
        </div>
      </div>)}
    </div>
  </div>
}
