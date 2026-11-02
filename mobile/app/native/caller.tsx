import { useEffect, useRef, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { Button, CompactField, Notice, PageHeader, Screen, Surface } from '../../src/shared/ui/components'
import { device } from '../../src/shared/native/device'
import { getAuthSessionEpoch } from '../../src/shared/auth/tokenStore'

type Match = { id: string; name: string }
type Lookup = { state: string; stale?: boolean; matches?: Match[]; event?: { id: string; title: string } }
export default function CallerScreen() {
  const params = useLocalSearchParams<{ number?: string }>()
  const [number, setNumber] = useState(params.number || ''), [result, setResult] = useState<Lookup | null>(null), [error, setError] = useState('')
  const activeNumber = useRef(number), alive = useRef(true)
  activeNumber.current = number
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { setResult(null) }, [number])
  const lookup = async () => {
    const epoch = getAuthSessionEpoch(), requested = number
    setError('')
    try { if (device) { const found = JSON.parse(await device.lookupNumber(number)); if (alive.current && epoch === getAuthSessionEpoch() && requested === activeNumber.current) setResult(found) } }
    catch { setError('Не удалось прочитать локальную копию CRM') }
  }
  return <Screen><PageHeader title="Номер телефона" />
    <CompactField label="Телефон" keyboardType="phone-pad" value={number} onChangeText={setNumber} />
    <Button title="Найти в локальной CRM" disabled={!device || !number.trim()} onPress={() => void lookup()} />
    <Button title="Записать итог разговора" variant="secondary" disabled={!number.trim()} onPress={() => router.push({ pathname: '/native/call-result', params: { number, ...(result?.matches?.length === 1 ? { clientId: result.matches[0].id } : {}), ...(result?.event ? { eventId: result.event.id } : {}) } })} />
    {error ? <Notice tone="danger" message={error} /> : null}
    {result ? <Surface>
      <Notice message={result.state === 'unavailable' ? 'Локальная копия недоступна. Выполните синхронизацию.' : result.state === 'stale' ? 'Локальная копия устарела. Отсутствие совпадений не означает отсутствия клиента на сервере.' : result.state === 'ambiguous' ? 'Найдено несколько клиентов. Выберите нужного.' : result.state === 'unknown' ? 'В локальной CRM совпадений нет.' : 'Клиент найден'} />
      {result.stale && result.matches?.length ? <Notice message="Данные могут быть устаревшими" /> : null}
      {result.matches?.map(client => <Button key={client.id} title={client.name || 'Открыть клиента'} variant="secondary" onPress={() => router.push(`/clients/${client.id}` as never)} />)}
      {result.event ? <Button title={result.event.title || 'Открыть работу'} onPress={() => router.push(`/events/${result.event!.id}` as never)} /> : null}
    </Surface> : null}
  </Screen>
}
