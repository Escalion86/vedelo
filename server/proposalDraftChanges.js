import { isProposalTheme, isProposalLogoUrl, normalizeProposalAppearance } from '@helpers/proposalAppearance.mjs'
import { normalizeProposalBlocks, normalizeProposalMedia, normalizeProposalPackages } from '@helpers/proposalContent'

// Whitelist shared by draft updates and saving an edited new version.
export function applyProposalDraftChanges(draft, body, tenantId) {
  const error = (message, status, code) => ({ message, status, code })
  if (body.appearance !== undefined) {
    if (!isProposalTheme(body.appearance?.theme)) return error('Выберите тему оформления', 400, 'invalid_theme')
    if (body.appearance.logoUrl && !isProposalLogoUrl(body.appearance.logoUrl, tenantId)) return error('Недопустимый логотип', 400, 'invalid_logo')
    draft.appearance = normalizeProposalAppearance(body.appearance, tenantId)
  }
  if (body.title !== undefined) {
    const title = String(body.title || '')
      .trim()
      .slice(0, 200)
    if (!title)
      return error('Укажите название предложения', 400, 'title_required')
    draft.title = title
  }
  if (body.validUntil !== undefined) {
    const date = body.validUntil === null || body.validUntil === '' ? null : new Date(body.validUntil)
    if (date && Number.isNaN(date.getTime()))
      return error('Некорректный срок действия', 400, 'bad_valid_until')
    draft.validUntil = date
  }
  if (body.blocks !== undefined)
    draft.blocksSnapshot = normalizeProposalBlocks(body.blocks)
  if (body.packages !== undefined)
    draft.packages = normalizeProposalPackages(body.packages)
  if (body.media !== undefined)
    draft.mediaSnapshot = normalizeProposalMedia(body.media)
  if (body.messageText !== undefined)
    draft.messageText = String(body.messageText || '')
      .trim()
      .slice(0, 4000)
  return null
}
