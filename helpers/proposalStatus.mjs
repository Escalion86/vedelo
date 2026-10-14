// Acceptance remains meaningful after expiry; revoked and draft copies do not.
// A published link is visible on the order card even before it was sent.
export const getProposalStatus = (proposal, now = Date.now()) => {
  if (!proposal || !['published', 'expired'].includes(proposal.status)) return null
  if (proposal.selectedPackageId) return 'accepted'
  if (proposal.status !== 'published') return null
  if (proposal.validUntil && new Date(proposal.validUntil).getTime() < now) return null
  return proposal.sentAt ? 'sent' : 'published'
}

// Stronger states win when an order has several proposal versions.
const STATUS_PRIORITY = { published: 1, sent: 2, accepted: 3 }

export const summarizeProposalStatuses = (proposals, now = Date.now()) => {
  const result = {}
  for (const proposal of proposals) {
    const status = getProposalStatus(proposal, now)
    const eventId = String(proposal.eventId || '')
    if (!status || !eventId) continue
    const current = result[eventId]
    if (!current || STATUS_PRIORITY[status] > STATUS_PRIORITY[current])
      result[eventId] = status
  }
  return result
}
