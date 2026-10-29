export const PROPOSAL_THEMES = [
  { value: 'classic', name: 'Классическая' },
  { value: 'light', name: 'Светлая' },
  { value: 'blue', name: 'Синяя' },
  { value: 'dark', name: 'Тёмная' },
]

export const isProposalTheme = (value) =>
  PROPOSAL_THEMES.some((item) => item.value === value)

export const PROPOSAL_LOGO_ALIGNMENTS = [
  { value: 'left', name: 'Слева' },
  { value: 'center', name: 'По центру' },
  { value: 'right', name: 'Справа' },
]

export const isProposalLogoUrl = (value, tenantId) => {
  if (typeof value !== 'string' || value.length > 1024) return false
  try {
    const url = new URL(value)
    const match = url.pathname.match(
      /^\/uploads\/vedelo\/([a-f0-9]{24})\/(?:proposals|proposal-templates)\/[a-f0-9]{24}\/logos\/[a-f0-9-]+\/[^/]+\.webp$/i
    )
    return (
      url.origin === 'https://cloud.escalion.ru' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      Boolean(match) &&
      (!tenantId || match[1] === String(tenantId))
    )
  } catch {
    return false
  }
}

export const normalizeProposalAppearance = (value, tenantId) => ({
  theme: isProposalTheme(value?.theme) ? value.theme : 'classic',
  logoUrl: isProposalLogoUrl(value?.logoUrl, tenantId) ? value.logoUrl : '',
  logoAlignment: PROPOSAL_LOGO_ALIGNMENTS.some((item) => item.value === value?.logoAlignment)
    ? value.logoAlignment
    : 'left',
})
