import { useEffect, useRef, useState } from 'react'
import { Button, CompactField, Notice } from '../../shared/ui/components'
import { api } from '../../shared/api/client'
import { getAuthSessionEpoch } from '../../shared/auth/tokenStore'

export type SuggestedAddress = { town: string; street: string; house: string; latitude: string; longitude: string }
type Suggestion = { label: string; address: SuggestedAddress }
type Result = { success: boolean; data?: { unavailable?: boolean; suggestions?: Suggestion[]; selected?: Suggestion | null } }

export function AddressSuggestions({ town, onPick, onRefine }: { town: string; onPick: (value: SuggestedAddress) => void; onRefine: (selected: SuggestedAddress, value: SuggestedAddress) => void }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ key: string; rows: Suggestion[]; unavailable: boolean; session: number } | null>(null)
  const selection = useRef<AbortController | null>(null)
  useEffect(() => () => selection.current?.abort(), [])
  const search = query.trim()
  const key = JSON.stringify([search, town])
  useEffect(() => {
    if (search.length < 4) return
    const session = getAuthSessionEpoch()
    const controller = new AbortController()
    const current = () => !controller.signal.aborted && getAuthSessionEpoch() === session
    const timer = setTimeout(async () => {
      try {
        const response = await api.post<Result>('/address/suggest', { query: search, town }, { signal: controller.signal })
        if (!response.success || !response.data) throw Error('Unconfirmed')
        if (current()) setResult({ key, rows: response.data.suggestions || [], unavailable: Boolean(response.data.unavailable), session })
      } catch {
        if (current()) setResult({ key, rows: [], unavailable: true, session })
      }
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [key, search, town])

  const visible = result?.key === key && result.session === getAuthSessionEpoch() ? result : null
  return <>
    <CompactField label="Поиск адреса" value={query} onChangeText={setQuery} maxLength={300} />
    {visible?.unavailable ? <Notice message="Подсказки недоступны. Введите адрес вручную ниже." /> : null}
    {visible?.rows.map(({ label, address }, index) => <Button key={`${label}:${index}`} title={label} variant="secondary" onPress={() => {
      if (getAuthSessionEpoch() !== visible.session) return
      selection.current?.abort()
      const controller = new AbortController()
      selection.current = controller
      onPick(address)
      setQuery('')
      setResult(null)
      void api.post<Result>('/address/suggest', { mode: 'select', query: label }, { signal: controller.signal }).then(response => {
        const refined = response.success ? response.data?.selected?.address : null
        if (refined && !controller.signal.aborted && getAuthSessionEpoch() === visible.session) onRefine(address, refined)
      }).catch(() => { /* Адрес из выбранной подсказки уже заполнен. */ })
    }} />)}
  </>
}
