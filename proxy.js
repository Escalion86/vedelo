import { NextResponse } from 'next/server'
import {
  getDomainMigrationPhase,
  isExternalApiPath,
  isPwaSystemPath,
} from '@helpers/domainMigration.mjs'

const PRODUCTION_HOST = 'vedelo.ru'
const PRIMARY_ALIASES = new Set(['www.vedelo.ru'])
const LEGACY_HOSTS = new Set(['artistcrm.ru', 'www.artistcrm.ru'])
const PARTYCRM_HOST = process.env.PARTYCRM_DOMAIN || 'partycrm.ru'
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0'])

const normalizeHost = (host) =>
  String(host || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/:\d+$/, '')
    .replace(/\/$/, '')

export function proxy(request) {
  const host = normalizeHost(request.headers.get('host'))
  const forwardedProto = request.headers.get('x-forwarded-proto') || ''
  const url = request.nextUrl
  const partyHost = normalizeHost(PARTYCRM_HOST)
  const isLocalDevHost = LOCAL_DEV_HOSTS.has(host)

  if (!isLocalDevHost && partyHost && host === partyHost && url.pathname === '/') {
    const rewriteUrl = url.clone()
    rewriteUrl.pathname = '/party'
    return NextResponse.rewrite(rewriteUrl)
  }

  if (
    !isLocalDevHost &&
    partyHost &&
    host === partyHost &&
    url.pathname === '/manifest.json'
  ) {
    const rewriteUrl = url.clone()
    rewriteUrl.pathname = '/party-manifest.json'
    return NextResponse.rewrite(rewriteUrl)
  }

  const isPrimaryHost = host === PRODUCTION_HOST || PRIMARY_ALIASES.has(host)
  const isLegacyHost = LEGACY_HOSTS.has(host)
  if (!isPrimaryHost && !isLegacyHost) return NextResponse.next()

  if (isLegacyHost) {
    const migration = getDomainMigrationPhase({
      startedAt: process.env.BRAND_MIGRATION_STARTED_AT,
    })

    if (isExternalApiPath(url.pathname)) {
      const redirectUrl = url.clone()
      redirectUrl.hostname = PRODUCTION_HOST
      redirectUrl.protocol = 'https:'
      redirectUrl.port = ''
      return NextResponse.redirect(redirectUrl, 308)
    }

    if (migration.phase === 'locked') {
      if (url.pathname === '/' || url.pathname.startsWith('/cabinet')) {
        const rewriteUrl = url.clone()
        rewriteUrl.pathname = '/migrate'
        rewriteUrl.search = ''
        return NextResponse.rewrite(rewriteUrl)
      }
      if (url.pathname.startsWith('/api/') && !isPwaSystemPath(url.pathname)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Старый API закрыт. Используйте https://vedelo.ru/api',
          },
          { status: 410 }
        )
      }
    }

    const isPublicPage =
      url.pathname !== '/' &&
      !url.pathname.startsWith('/cabinet') &&
      !url.pathname.startsWith('/api/') &&
      !isPwaSystemPath(url.pathname)
    if (isPublicPage) {
      const redirectUrl = url.clone()
      redirectUrl.hostname = PRODUCTION_HOST
      redirectUrl.protocol = 'https:'
      redirectUrl.port = ''
      return NextResponse.redirect(redirectUrl, 301)
    }

    const shouldUseLegacyApex = host === 'www.artistcrm.ru'
    const shouldUseHttps = forwardedProto === 'http' || url.protocol === 'http:'
    if (!shouldUseLegacyApex && !shouldUseHttps) return NextResponse.next()

    const legacyUrl = url.clone()
    legacyUrl.hostname = 'artistcrm.ru'
    legacyUrl.protocol = 'https:'
    legacyUrl.port = ''
    return NextResponse.redirect(legacyUrl, 308)
  }

  const shouldUseApex = PRIMARY_ALIASES.has(host)
  const shouldUseHttps = forwardedProto === 'http' || url.protocol === 'http:'

  if (!shouldUseApex && !shouldUseHttps) return NextResponse.next()

  const redirectUrl = url.clone()
  redirectUrl.hostname = PRODUCTION_HOST
  redirectUrl.protocol = 'https:'
  redirectUrl.port = ''

  return NextResponse.redirect(redirectUrl, 308)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
