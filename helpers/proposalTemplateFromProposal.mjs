import {
  normalizeProposalMedia,
  normalizeProposalTemplateDefaults,
  toProposalEditorBlocks,
} from './proposalContent.js'
import { normalizeProposalAppearance } from './proposalAppearance.mjs'

// Копируем только содержимое шаблона, без связи с клиентом и состояния КП.
export const proposalTemplateFromProposal = (proposal) => {
  const source = JSON.parse(JSON.stringify(proposal))
  return {
    name: String(source.title || 'Шаблон предложения').trim().slice(0, 160),
    status: 'active',
    appearance: normalizeProposalAppearance(source.appearance),
    blocks: toProposalEditorBlocks(source.blocksSnapshot, source.artistSnapshot),
    defaults: normalizeProposalTemplateDefaults({ packages: source.packages }),
    media: normalizeProposalMedia(source.mediaSnapshot),
    messageTemplate: String(source.messageText ?? ''),
  }
}
