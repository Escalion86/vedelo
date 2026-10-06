import { useEffect, useRef, useState } from 'react'
import { safeDocumentError } from './documentUi'

export const useDocumentTask = (key: string) => {
  const lifecycle = useRef(0)
  const activeKey = useRef<string | null>(null)
  const busy = useRef(false)
  const [phase, setPhase] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { activeKey.current = key; lifecycle.current += 1; busy.current = false; setPhase(''); setError(''); return () => { activeKey.current = null; lifecycle.current += 1 } }, [key])
  const run = async (label: string, fallback: string, action: (current: () => boolean) => Promise<void>) => {
    if (busy.current || activeKey.current !== key) return
    busy.current = true
    const token = lifecycle.current
    const current = () => lifecycle.current === token
    setPhase(label); setError('')
    try { await action(current) }
    catch (cause) { if (current()) setError(safeDocumentError(cause, fallback)) }
    finally { if (current()) { busy.current = false; setPhase('') } }
  }
  return { busy, phase, error, setError, run, isActive: () => activeKey.current === key }
}
