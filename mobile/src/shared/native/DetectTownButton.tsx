import { useEffect, useRef, useState } from 'react'
import { PermissionsAndroid } from 'react-native'
import { Button, Notice } from '../ui/components'
import { device } from './device'

export function DetectTownButton({ value, onConfirm, disabled = false }: { value: string; onConfirm: (town: string) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [suggested, setSuggested] = useState('')
  const alive = useRef(true), revision = useRef(0), lastValue = useRef(value), inFlight = useRef(false)
  if (lastValue.current !== value) { lastValue.current = value; revision.current++ }
  const suggestedRevision = useRef(-1)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const detect = async () => {
    if (!device || inFlight.current || disabled) return
    const started = revision.current
    inFlight.current = true; setBusy(true); setError(''); setSuggested('')
    try {
      const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION)
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('PERMISSION_DENIED')
      const result = await device.locateTown()
      if (!alive.current) return
      if (started !== revision.current) { setError('Поле уже изменено вручную. Введённый город сохранён.'); return }
      suggestedRevision.current = started; setSuggested(result.town)
    } catch { if (alive.current) setError('Не удалось определить город. Можно ввести его вручную.') }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  if (!device) return null
  return <><Button title="Определить город" variant="secondary" disabled={busy || disabled} loading={busy} onPress={() => void detect()} />
    {error ? <Notice message={error} /> : null}
    {suggested && suggestedRevision.current === revision.current ? <Button title={`Использовать город: ${suggested}`} disabled={disabled} onPress={() => {
      if (suggestedRevision.current === revision.current) { onConfirm(suggested); setSuggested('') }
    }} /> : null}
  </>
}
