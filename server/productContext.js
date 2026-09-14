export const PRODUCTS = Object.freeze({
  ARTISTCRM: 'artistcrm',
  PARTYCRM: 'partycrm',
})

const PARTYCRM_ROUTE_PREFIXES = ['/party', '/company', '/performer', '/api/party']

const normalizeHost = (host) =>
  String(host || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/:\d+$/, '')
    .replace(/\/$/, '')

const normalizeDomain = (domain) => normalizeHost(domain)

export const normalizeProduct = (product) =>
  product === PRODUCTS.PARTYCRM ? PRODUCTS.PARTYCRM : PRODUCTS.ARTISTCRM

export const getProductByPathname = (pathname = '') => {
  const path = String(pathname || '')
  return PARTYCRM_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
    ? PRODUCTS.PARTYCRM
    : PRODUCTS.ARTISTCRM
}

export const getProductByHost = (host) => {
  const normalizedHost = normalizeHost(host)
  if (!normalizedHost || normalizedHost === 'localhost') return null

  const partyDomain = normalizeDomain(process.env.PARTYCRM_DOMAIN || 'partycrm.ru')
  const artistDomain = normalizeDomain(process.env.DOMAIN || 'vedelo.ru')

  if (partyDomain && normalizedHost === partyDomain) return PRODUCTS.PARTYCRM
  if (artistDomain && normalizedHost === artistDomain) return PRODUCTS.ARTISTCRM
  if (normalizedHost === 'artistcrm.ru' || normalizedHost === 'www.artistcrm.ru') {
    return PRODUCTS.ARTISTCRM
  }

  return null
}

export const getProductContext = ({ host, pathname } = {}) => {
  const hostProduct = getProductByHost(host)
  const routeProduct = getProductByPathname(pathname)

  return {
    product: hostProduct || routeProduct,
    hostProduct,
    routeProduct,
  }
}
