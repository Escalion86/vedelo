// Acceptance remains meaningful after expiry; revoked and draft copies do not.
export const getProposalStatus = (proposal, now = Date.now()) => {
  if (!proposal || !['published', 'expired'].includes(proposal.status)) return null
  if (proposal.selectedPackageId) return 'accepted'
  if (proposal.status !== 'published') return null
  if (proposal.validUntil && new Date(proposal.validUntil).getTime() < now) return null
  return proposal.sentAt ? 'sent' : null
}

export const summarizeProposalStatuses = (proposals, now = Date.now()) => {
  const result = {}
  for (const proposal of proposals) {
    const status = getProposalStatus(proposal, now)
    const eventId = String(proposal.eventId || '')
    if (status && eventId && result[eventId] !== 'accepted') result[eventId] = status
  }
  return result
}
