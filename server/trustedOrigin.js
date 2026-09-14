import { BRAND } from '@helpers/brand.mjs'

const TRUSTED_HOSTS = new Set([
  BRAND.primaryHost,
  `www.${BRAND.primaryHost}`,
  BRAND.legacyHost,
  `www.${BRAND.legacyHost}`,
])

export const resolveTrustedRequestOrigin = (request, preferredOrigin = '') => {
  const candidates = [preferredOrigin, request?.nextUrl?.origin, request?.url]
  for (const candidate of candidates) {
    try {
      const url = new URL(String(candidate || ''))
      const hostname = url.hostname.toLowerCase()
      if (TRUSTED_HOSTS.has(hostname)) return `https://${hostname.replace(/^www\./, '')}`
      if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(hostname)) {
        return url.origin
      }
    } catch (error) {
      continue
    }
  }
  return BRAND.primaryUrl
}

export const isTrustedBrandHost = (hostname = '') =>
  TRUSTED_HOSTS.has(String(hostname).toLowerCase())
