import {
  normalizeProposalBlocks,
  normalizeProposalMedia,
  normalizeProposalPackages,
  renderProposalVariables,
} from '../helpers/proposalContent.js'
import {
  getProposalBlockContentHtml,
  renderProposalRichTextVariables,
} from '../helpers/proposalRichText.js'
import { normalizeProposalAppearance } from '../helpers/proposalAppearance.mjs'
import { isProposalSelectionLocked, isProposalApplicationPending } from '../helpers/proposalWorkflow.js'

// The same rendered snapshot/variable pipeline as the public proposal route.
// No credentials or persistence side effects belong to a private preview.
export function buildProposalPreview(proposal, input = {}) {
  const variables = {
    client: proposal.clientSnapshot || {},
    event: proposal.eventSnapshot || {},
    artist: proposal.artistSnapshot || {},
  }
  const mediaSource = input.media ?? proposal.mediaSnapshot ?? []
  const validUntil = Object.hasOwn(input, 'validUntil')
    ? input.validUntil
    : proposal.validUntil
  return {
    id: String(proposal._id || ''),
    title: String(input.title ?? proposal.title ?? ''),
    appearance: normalizeProposalAppearance(
      input.appearance ?? proposal.appearance,
      proposal.tenantId
    ),
    version: proposal.version,
    status: proposal.status,
    validUntil,
    blocks: normalizeProposalBlocks(
      input.blocks ?? proposal.blocksSnapshot
    ).map((block) => ({
      ...block,
      title: renderProposalVariables(block.title, variables).text,
      text: renderProposalVariables(block.text, variables).text,
      contentHtml: renderProposalRichTextVariables(
        getProposalBlockContentHtml(block),
        variables
      ).html,
    })),
    packages: normalizeProposalPackages(input.packages ?? proposal.packages),
    media: normalizeProposalMedia(mediaSource).map((item) => {
      const original =
        mediaSource.find((source) => source?.id === item.id) || {}
      return Object.fromEntries(
        Object.entries(item).filter(
          ([key]) =>
            ['id', 'kind', 'url'].includes(key) || Object.hasOwn(original, key)
        )
      )
    }),
    event: proposal.eventSnapshot,
    client: { firstName: proposal.clientSnapshot?.firstName || '' },
    artist: proposal.artistSnapshot,
    selectedPackageId: proposal.selectedPackageId || '',
    selectedAt: proposal.selectedAt,
    selectionLocked: isProposalSelectionLocked(proposal),
    applicationPending: isProposalApplicationPending(proposal),
    appliedPackageId: proposal.appliedPackageId || '',
    expired: Boolean(validUntil && new Date(validUntil).getTime() < Date.now()),
  }
}
