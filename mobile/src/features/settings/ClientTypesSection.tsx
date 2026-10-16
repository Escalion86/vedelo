import { useRef, useState } from 'react'
import { View } from 'react-native'
import { randomUUID } from 'expo-crypto'
import { Button, CompactField, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { useClientTypes } from '../../shared/hooks/useClientTypes'
import type { ClientType } from '../../shared/domain/clientTypes'

function TypeRow({ item, index, count, disabled, change }: {
  item: ClientType; index: number; count: number; disabled: boolean
  change: (action: string, value: string, argument?: string | number) => Promise<void>
}) {
  const [name, setName] = useState(item.name)
  return <Surface>
    <CompactField label={`Название типа «${item.name}»`} value={name} onChangeText={setName} editable={!disabled} maxLength={60} />
    <Button title="Сохранить название" disabled={disabled || name.trim() === item.name} onPress={() => void change('rename', item.value, name)} />
    <Button title={item.hidden ? 'Показать' : 'Скрыть'} variant="secondary" disabled={disabled || item.value === 'none'} onPress={() => void change('hide', item.value)} />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Button title="Выше" accessibilityLabel={`Выше: ${item.name}`} variant="secondary" disabled={disabled || index === 0} onPress={() => void change('move', item.value, -1)} />
      <Button title="Ниже" accessibilityLabel={`Ниже: ${item.name}`} variant="secondary" disabled={disabled || index === count - 1} onPress={() => void change('move', item.value, 1)} />
    </View>
    {item.hidden ? <Notice message="Скрыт для новых клиентов" /> : null}
    {item.value === 'colleague' ? <Notice message="Этот тип используется для передачи заказа коллеге" /> : null}
  </Surface>
}

export function ClientTypesSection({ onAdded }: { onAdded?: (value: string) => void }) {
  const query = useClientTypes()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const change = async (action: string, value: string, argument?: string | number) => {
    if (lock.current || !query.data) return
    lock.current = true; setBusy(true); setError('')
    try {
      let next = query.items.map(item => ({ ...item }))
      if (action === 'add') next.push({ value, name: name.trim(), hidden: false })
      if (action === 'rename') next = next.map(item => item.value === value ? { ...item, name: String(argument).trim() } : item)
      if (action === 'hide') next = next.map(item => item.value === value ? { ...item, hidden: !item.hidden } : item)
      if (action === 'move') {
        const index = next.findIndex(item => item.value === value)
        const [item] = next.splice(index, 1)
        next.splice(index + Number(argument), 0, item)
      }
      await query.save(next, query.data.version)
      if (action === 'add') { setName(''); onAdded?.(value) }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить типы') }
    finally { lock.current = false; setBusy(false) }
  }
  const disabled = busy || query.isFetching || !query.data
  return <Surface>
    <SectionTitle>Типы клиентов</SectionTitle>
    <Notice message="Общий список организации. Изменения сохраняются сразу при наличии сети. Скрытые типы остаются в старых карточках." />
    {error || query.error ? <Notice tone="danger" message={error || 'Не удалось обновить список. Показана сохранённая копия.'} /> : null}
    <Button title="Обновить список типов" variant="secondary" disabled={busy || query.isFetching} onPress={() => void query.refetch().then(result => { if (!result.error) setError('') })} />
    <CompactField label="Новый тип клиента" value={name} onChangeText={setName} editable={!disabled} maxLength={60} />
    <Button title="Добавить тип" disabled={disabled || !name.trim()} onPress={() => void change('add', `custom_${randomUUID()}`)} />
    {query.items.map((item, index) => <TypeRow key={`${item.value}:${item.name}`} item={item} index={index} count={query.items.length} disabled={disabled} change={change} />)}
  </Surface>
}
