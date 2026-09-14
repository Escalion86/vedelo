export const BRAND = Object.freeze({
  name: 'Ведело',
  previousName: 'ArtistCRM',
  primaryHost: 'vedelo.ru',
  legacyHost: 'artistcrm.ru',
  primaryUrl: 'https://vedelo.ru',
  legacyUrl: 'https://artistcrm.ru',
  transitionSignature: 'Ведело — ранее ArtistCRM',
  description: 'CRM для малого бизнеса и частных специалистов',
})

export const BRAND_TRANSITION_MONTHS = 6

const normalizeHost = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/:\d+$/, '')
    .replace(/\/$/, '')

export const getBrandHostKind = (value) => {
  const host = normalizeHost(value)
  if (host === BRAND.legacyHost || host === `www.${BRAND.legacyHost}`) {
    return 'artistcrm'
  }
  return 'vedelo'
}

export const getCanonicalBaseUrl = (value) => {
  const raw = String(value || BRAND.primaryUrl).trim()
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withProtocol.replace(/\/$/, '')
}
