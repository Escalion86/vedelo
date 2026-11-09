import { useEffect, useRef, useState } from 'react'
import { Button, Notice } from '../../shared/ui/components'
import { QuickActionsSheet } from '../../shared/ui/QuickContacts'
import { SingleDateCalendar } from '../../shared/ui/SingleDateCalendar'
import { proposalsApi, type Proposal } from './api'
import { useProposalIdentity } from './identity'

export function proposalIsExpired(item: Pick<Proposal, 'status' | 'validUntil'>, now = Date.now()) {
  return ['published', 'expired'].includes(item.status) &&
    (item.status === 'expired' || Boolean(item.validUntil && Date.parse(item.validUntil) <= now))
}

function firstFutureDay() {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function ProposalRenewButton({ proposal, onRenewed, disabled }: {
  proposal: Proposal; onRenewed: (value: Proposal) => void; disabled?: boolean
}) {
  const identity = useProposalIdentity()
  const [day, setDay] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const lifetime = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [identity, proposal._id])

  const confirm = async () => {
    if (lock.current || disabled || day < firstFutureDay()) return
    const { signal } = lifetime.current
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const result = await proposalsApi.renew(proposal._id, proposal.eventId, day, { expectedIdentity: identity, signal })
      if (!signal.aborted) { onRenewed(result); setDay('') }
    } catch {
      if (!signal.aborted) setError('Не удалось подтвердить продление. Проверьте сеть и повторите.')
    } finally {
      lock.current = false
      if (!signal.aborted) setBusy(false)
    }
  }
  if (!proposalIsExpired(proposal)) return null
  return <>
    <Button title="Продлить срок" variant="secondary" disabled={disabled || busy} onPress={() => { setDay(firstFutureDay()); setError('') }} />
    <QuickActionsSheet title="Продлить срок КП" visible={Boolean(day)} onClose={() => { if (!lock.current) setDay('') }}>
      <SingleDateCalendar value={day} onChange={setDay} minDay={firstFutureDay()} disabled={busy} />
      {error ? <Notice tone="danger" message={error} /> : null}
      <Button title="Продлить" loading={busy} disabled={disabled || busy || day < firstFutureDay()} onPress={() => void confirm()} />
      <Button title="Отмена" variant="secondary" disabled={busy} onPress={() => setDay('')} />
    </QuickActionsSheet>
  </>
}
