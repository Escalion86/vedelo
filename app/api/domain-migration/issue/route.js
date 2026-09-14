import { NextResponse } from 'next/server'
import getTenantContext from '@server/getTenantContext'
import { issueDomainMigrationCode } from '@server/domainMigration'
import { buildMigrationTargetUrl, isLegacyMigrationHost } from '@helpers/domainMigration.mjs'

export const POST = async (request) => {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const isDevelopment = process.env.NODE_ENV !== 'production'
  if (!isDevelopment && !isLegacyMigrationHost(host)) {
    return NextResponse.json({ success: false, error: 'Перенос запускается со старого домена' }, { status: 400 })
  }

  const { user, tenantId } = await getTenantContext()
  if (!user?._id || !tenantId) {
    return NextResponse.json({ success: false, error: 'Сессия истекла' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  let legacyPushEndpoint = ''
  try {
    const endpointUrl = new URL(String(body?.legacyPushEndpoint || ''))
    if (endpointUrl.protocol === 'https:') legacyPushEndpoint = endpointUrl.toString()
  } catch (error) {
    legacyPushEndpoint = ''
  }
  const issued = await issueDomainMigrationCode({
    userId: user._id,
    tenantId,
    legacyPushEndpoint,
  })
  if (!issued) {
    return NextResponse.json({ success: false, error: 'Не удалось начать перенос' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: { url: buildMigrationTargetUrl(issued.code), expiresAt: issued.expiresAt },
  })
}
