import { BRAND, getBrandHostKind } from './brand.mjs'

export const DOMAIN_MIGRATION_DURATION_DAYS = 30
export const DOMAIN_MIGRATION_CODE_TTL_MS = 5 * 60 * 1000

export const getDomainMigrationStart = (value) => {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? null : date
}

export const getDomainMigrationPhase = ({ now = new Date(), startedAt } = {}) => {
  const start = getDomainMigrationStart(startedAt)
  if (!start) return { phase: 'inactive', day: 0, daysLeft: DOMAIN_MIGRATION_DURATION_DAYS }

  const elapsedMs = new Date(now).getTime() - start.getTime()
  if (elapsedMs < 0) {
    return { phase: 'inactive', day: 0, daysLeft: DOMAIN_MIGRATION_DURATION_DAYS }
  }
  const day = Math.floor(elapsedMs / 86_400_000) + 1
  if (day >= DOMAIN_MIGRATION_DURATION_DAYS) {
    return { phase: 'locked', day, daysLeft: 0 }
  }
  if (day >= 15) {
    return {
      phase: 'countdown',
      day,
      daysLeft: DOMAIN_MIGRATION_DURATION_DAYS - day,
    }
  }
  return {
    phase: 'announcement',
    day,
    daysLeft: DOMAIN_MIGRATION_DURATION_DAYS - day,
  }
}

export const isLegacyMigrationHost = (host) =>
  getBrandHostKind(host) === 'artistcrm'

export const buildMigrationTargetUrl = (code) =>
  `${BRAND.primaryUrl}/migrate#code=${encodeURIComponent(String(code || ''))}`

export const isPwaSystemPath = (pathname = '') =>
  pathname === '/manifest.json' ||
  pathname === '/sw.js' ||
  pathname === '/service-worker.js' ||
  pathname === '/migrate' ||
  pathname.startsWith('/icons/') ||
  pathname.startsWith('/brand/') ||
  pathname.startsWith('/_next/') ||
  pathname === '/api/domain-migration/issue' ||
  pathname === '/api/domain-migration/status' ||
  pathname === '/api/push/unsubscribe'

export const isExternalApiPath = (pathname = '') =>
  pathname.startsWith('/api/public/') ||
  pathname.startsWith('/api/webhooks/') ||
  (pathname.startsWith('/api/') && pathname.endsWith('/webhook')) ||
  pathname.includes('/webhook/')
