import { useState } from 'react'
import { router } from 'expo-router'
import { Button, Notice, SectionTitle, StatusChip, Surface } from '../../shared/ui/components'
import { useProposalOverview } from './statusHooks'
import type { ProposalStatus } from './api'

const labels = { accepted: 'КП принято', sent: 'КП отправлено', published: 'КП опубликовано', expired: 'Срок КП истёк' }
export function ProposalStatusChip({ status }: { status?: ProposalStatus }) {
  return status ? <StatusChip label={labels[status]} tone={status === 'expired' ? 'warning' : status === 'accepted' ? 'success' : 'neutral'} /> : null
}

export function ExpiredProposalsSection() {
  const query = useProposalOverview('expired')
  const [visible, setVisible] = useState(5)
  const status = (query.error as { status?: number } | null)?.status
  if (status === 401 || status === 403 || query.fetchStatus === 'idle' && query.isPending) return null
  const rows = Array.isArray(query.data) ? query.data : []
  if (!query.isPending && !query.isError && !rows.length) return null
  return <Surface testID="expired-proposals">
    <SectionTitle>КП с истёкшим сроком{rows.length ? ` (${rows.length})` : ''}</SectionTitle>
    {query.isPending ? <Notice message="Проверяем сроки предложений…" /> : null}
    {query.isError ? <>
      <Notice tone="danger" message="Не удалось проверить сроки КП" />
      <Button title="Повторить проверку сроков КП" variant="secondary" onPress={() => void query.refetch()} />
    </> : null}
    {rows.slice(0, visible).map(item => <Button key={item._id} title={`${item.title} · ${item.eventType || 'Открыть работу'}`} variant="secondary" onPress={() => router.push(`/events/${encodeURIComponent(item.eventId)}` as never)} />)}
    {rows.length > visible ? <Button title={`Показать ещё (${rows.length - visible})`} variant="secondary" onPress={() => setVisible(count => count + 5)} /> : null}
  </Surface>
}
