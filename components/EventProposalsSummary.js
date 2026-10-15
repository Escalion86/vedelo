'use client'

import { useEventProposalsQuery } from '@helpers/useEventProposalsQuery'
import { getEventProposalsSummary } from '@helpers/proposalSummary'

export default function EventProposalsSummary({ eventId }) {
  // Только наблюдение: список внутри формы уже загружает этот общий query.
  const query = useEventProposalsQuery(eventId, { enabled: false })
  return (
    <span aria-live="polite">
      {getEventProposalsSummary({ eventId, ...query })}
    </span>
  )
}
