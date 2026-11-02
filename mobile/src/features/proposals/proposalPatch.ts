type EditableProposal = {
  title: string; blocks: unknown[]; media: unknown[]; packages: unknown[]; message: string
  validUntil: string; appearance: unknown; contentRevision?: number
}
// Preserve fields the user did not edit, including hidden sections and the
// original validity timestamp. The server checks the captured content revision.
export function proposalPatch(value: EditableProposal, baseline: string): Record<string, unknown> {
  const original: Partial<EditableProposal> = baseline ? JSON.parse(baseline) : {}
  const patch: Record<string, unknown> = { contentRevision: value.contentRevision ?? 0 }
  const fields = ['title', 'blocks', 'media', 'packages', 'message', 'validUntil', 'appearance'] as const
  for (const field of fields) {
    if (JSON.stringify(value[field]) === JSON.stringify(original[field])) continue
    patch[field === 'message' ? 'messageText' : field] = field === 'validUntil' ? value[field] || null : value[field]
  }
  return patch
}
