'use client'

import { useRef, useState } from 'react'
import Input from './Input'
import AppButton from './AppButton'
import Notice from './Notice'
import MutedText from './MutedText'
import { useClientTypes } from '@helpers/useClientTypes'
import { validateClientTypes } from '@helpers/clientTypes.mjs'
import useSnackbar from '@helpers/useSnackbar'

const TypeRow = ({ item, index, count, busy, change }) => {
  const [name, setName] = useState(item.name)
  return <div className="flex min-w-0 flex-col gap-2 rounded border border-gray-300 p-3">
    <Input label={`Название типа «${item.name}»`} ariaLabel={`Название типа «${item.name}»`} value={name} onChange={setName} disabled={busy} fullWidth maxLength={60} />
    <div className="flex flex-wrap gap-2">
      <AppButton className="min-h-10" size="sm" disabled={busy || name.trim() === item.name} onClick={() => change('rename', item.value, name)}>Сохранить название</AppButton>
      <AppButton className="min-h-10" size="sm" variant="secondary" disabled={busy || item.value === 'none'} onClick={() => change('hide', item.value)}>{item.hidden ? 'Показать' : 'Скрыть'}</AppButton>
      <AppButton className="min-h-10" size="sm" variant="ghost" aria-label={`Выше: ${item.name}`} disabled={busy || index === 0} onClick={() => change('move', item.value, -1)}>Выше</AppButton>
      <AppButton className="min-h-10" size="sm" variant="ghost" aria-label={`Ниже: ${item.name}`} disabled={busy || index === count - 1} onClick={() => change('move', item.value, 1)}>Ниже</AppButton>
    </div>
    {item.hidden ? <MutedText>Скрыт для новых клиентов</MutedText> : null}
    {item.value === 'colleague' ? <MutedText>Этот тип используется для передачи заказа коллеге</MutedText> : null}
  </div>
}

export default function ClientTypesEditor({ onAdded }) {
  const snackbar = useSnackbar()
  const query = useClientTypes()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const items = query.data?.items || []
  const change = async (action, value, argument) => {
    if (lock.current || !query.data) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      let next = items.map((item) => ({ ...item }))
      if (action === 'add') next.push({ value, name, hidden: false })
      if (action === 'rename') next = next.map((item) => item.value === value ? { ...item, name: argument } : item)
      if (action === 'hide') next = next.map((item) => item.value === value ? { ...item, hidden: !item.hidden } : item)
      if (action === 'move') {
        const index = next.findIndex((item) => item.value === value)
        const [item] = next.splice(index, 1)
        next.splice(index + argument, 0, item)
      }
      await query.save(validateClientTypes(next, items), query.data.version)
      snackbar.success('Типы клиентов сохранены')
      if (action === 'add') { setName(''); onAdded?.(value) }
    } catch (cause) { setError(cause.message || 'Не удалось сохранить типы') }
    finally { lock.current = false; setBusy(false) }
  }
  return <div className="flex min-w-0 flex-col gap-3">
    <MutedText as="p">Общий список организации. Изменения сохраняются сразу. Скрытые типы остаются в старых карточках.</MutedText>
    {query.isPending ? <Notice>Загрузка типов клиентов…</Notice> : null}
    {error || query.error ? <Notice tone="error" role="alert">{error || query.error.message}</Notice> : null}
    <AppButton className="min-h-10" variant="ghost" size="sm" disabled={busy || query.isFetching} onClick={async () => { const result = await query.refetch(); if (!result.error) setError('') }}>Обновить список</AppButton>
    <Input label="Новый тип клиента" ariaLabel="Новый тип клиента" value={name} onChange={setName} disabled={busy || !query.data} fullWidth maxLength={60} />
    <AppButton disabled={busy || !query.data || !name.trim() || query.isFetching} onClick={() => change('add', `custom_${crypto.randomUUID()}`)}>Добавить тип</AppButton>
    {items.map((item, index) => <TypeRow key={`${item.value}:${item.name}`} item={item} index={index} count={items.length} busy={busy || query.isFetching} change={change} />)}
  </div>
}
