import { useMemo, useRef, useState } from 'react'
import { PermissionsAndroid, Text } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button, CompactField, Notice, PageHeader, Screen, SectionTitle, Surface } from '../../src/shared/ui/components'
import { device, type PhoneContact } from '../../src/shared/native/device'
import { contactDuplicates, importSelectedContacts, type ContactSelection } from '../../src/shared/native/contactImport'
import { useCachedEntities } from '../../src/shared/hooks/useCachedEntities'
import type { Client } from '../../src/shared/domain/types'
import { useTheme } from '../../src/shared/ui/ThemeProvider'

export default function PhonebookScreen() {
  const clients = useCachedEntities<Client>('clients'), queryClient = useQueryClient(), { palette } = useTheme()
  const [contacts, setContacts] = useState<PhoneContact[]>([]), [search, setSearch] = useState(''), [limit, setLimit] = useState(30)
  const [selected, setSelected] = useState<Record<string, ContactSelection>>({}), [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('')
  const lock = useRef(false)
  const filtered = useMemo(() => contacts.filter(contact => `${contact.name} ${contact.phones.join(' ')}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [contacts, search])
  const action = async (work: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try { await work() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось прочитать контакты') }
    finally { lock.current = false; setBusy(false) }
  }
  const read = () => action(async () => {
    if (!device) throw new Error('Требуется новая нативная сборка APK')
    const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CONTACTS)
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Доступ не разрешён. Клиента можно добавить вручную.')
    setContacts(await device.readContacts())
  })
  const rows = preview ? Object.values(selected).map(item => item.contact) : filtered.slice(0, limit)
  return <Screen><PageHeader title="Телефонная книга" />
    <Notice message="Выберите один или несколько контактов. В CRM попадут только выбранные контакты после подтверждения импорта." />
    {error ? <Notice tone="danger" message={error} /> : null}{message ? <Notice tone="success" message={message} /> : null}
    {!contacts.length ? <Button title="Выбрать контакты из телефона" disabled={busy} onPress={() => void read()} /> : <>
      {!preview ? <CompactField label="Поиск в телефонной книге" value={search} onChangeText={setSearch} /> : <SectionTitle>Предпросмотр импорта</SectionTitle>}
      {rows.map(contact => {
        const selection = selected[contact.id], matches = contactDuplicates(contact, clients.data || [])
        return <Surface key={contact.id}><SectionTitle>{contact.name || 'Без имени'}</SectionTitle>
          <Text style={{ color: palette.text }}>{contact.phones.join('\n')}</Text>
          {matches.length ? <><Notice message="Найдены совпадения в локальной CRM. Новый клиент не будет создан." />
            {matches.map(match => <Button key={match._id} title={`Открыть: ${[match.firstName, match.secondName].filter(Boolean).join(' ') || match._id}`} variant="secondary" onPress={() => router.push(`/clients/${match._id}` as never)} />)}
            {matches.length > 1 ? <Button title="Объединить совпадения" variant="secondary" onPress={() => router.push(`/clients/${matches[0]._id}/merge` as never)} /> : null}
          </> : null}
          {!preview ? <Button title={selection ? 'Убрать из выбранных' : 'Выбрать'} variant="secondary" disabled={busy || matches.length > 0} onPress={() => setSelected(current => {
            const next = { ...current }; if (next[contact.id]) delete next[contact.id]
            else next[contact.id] = { contact, primary: contact.phones.length === 1 ? contact.phones[0] : '', keepAdditional: false }
            return next
          })} /> : null}
          {selection ? <>{contact.phones.map(phone => <Button key={phone} title={`${selection.primary === phone ? '✓ ' : ''}Основной: ${phone}`} variant="secondary" disabled={busy} onPress={() => setSelected(current => ({ ...current, [contact.id]: { ...selection, primary: phone } }))} />)}
            {contact.phones.length > 1 ? <Button title={selection.keepAdditional ? '✓ Дополнительные номера в комментарии' : 'Сохранить дополнительные номера в комментарии'} variant="secondary" disabled={busy} onPress={() => setSelected(current => ({ ...current, [contact.id]: { ...selection, keepAdditional: !selection.keepAdditional } }))} /> : null}
          </> : null}
        </Surface>
      })}
      {!preview && filtered.length > limit ? <Button title="Показать ещё" variant="secondary" onPress={() => setLimit(limit + 30)} /> : null}
      {preview ? <><Button title={`Подтвердить импорт: ${Object.keys(selected).length}`} disabled={busy || Object.values(selected).some(item => !item.primary) || clients.isPending || clients.isError || !Object.keys(selected).length} onPress={() => void action(async () => {
        const result = await importSelectedContacts(Object.values(selected))
        await queryClient.invalidateQueries({ queryKey: ['cached-entities', 'clients'] })
        setMessage(`Добавлено в CRM: ${result.created.length}. Пропущено совпадений: ${result.duplicates.length}. Изменения отправляются обычной очередью синхронизации.`)
        setSelected({}); setPreview(false)
      })} /><Button title="Назад к выбору" variant="secondary" disabled={busy} onPress={() => setPreview(false)} /></>
        : <Button title={`Предпросмотр: ${Object.keys(selected).length}`} disabled={!Object.keys(selected).length || busy} onPress={() => setPreview(true)} />}
    </>}
  </Screen>
}
