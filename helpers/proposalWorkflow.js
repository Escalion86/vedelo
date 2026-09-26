export const proposalLineFromService = (service) => ({
  serviceId: String(service._id),
  title: service.title || '',
  description: service.description || '',
  price: Math.max(0, Number(service.price) || 0),
})

export const calculatePackageTotal = (lines) =>
  Math.round(
    (lines || []).reduce(
      (sum, line) => sum + Math.max(0, Number(line.price) || 0),
      0
    ) * 100
  ) / 100

export const isProposalSelectionApplied = (proposal) =>
  Boolean(
    proposal.appliedAt &&
    proposal.selectedPackageId &&
    (proposal.appliedPackageId
      ? proposal.appliedPackageId === proposal.selectedPackageId &&
        String(proposal.appliedSelectionAt) === String(proposal.selectedAt)
      : !proposal.selectedAt ||
        new Date(proposal.selectedAt) <= new Date(proposal.appliedAt))
  )

export const buildAgreedProposal = (proposal, selected, servicesIds) => ({
  proposalId: String(proposal._id),
  version: proposal.version,
  packageId: selected.id,
  title: selected.title,
  total: Number(selected.total) || 0,
  lines: selected.lines.map((line) => ({ ...line })),
  servicesIds: servicesIds.map(String),
  selectedAt: proposal.selectedAt,
})

// Retain edited snapshots and custom/unavailable lines; only copy newly selected services.
export const reconcileProposalServices = (lines, selectedIds, services) => {
  const selected = new Set(selectedIds.map(String))
  const available = new Map(
    services.map((service) => [String(service._id), service])
  )
  const result = lines.filter(
    (line) =>
      !line.serviceId ||
      !available.has(String(line.serviceId)) ||
      selected.has(String(line.serviceId))
  )
  const existing = new Set(result.map((line) => String(line.serviceId)))
  for (const id of selected) {
    if (!existing.has(id) && available.has(id))
      result.push(proposalLineFromService(available.get(id)))
  }
  return result
}
