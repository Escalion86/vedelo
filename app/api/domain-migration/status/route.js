import { NextResponse } from 'next/server'
import { getDomainMigrationPhase } from '@helpers/domainMigration.mjs'
import { BRAND, getBrandHostKind } from '@helpers/brand.mjs'

export const dynamic = 'force-dynamic'

export const GET = async (request) => {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const campaign = getDomainMigrationPhase({
    startedAt: process.env.BRAND_MIGRATION_STARTED_AT,
  })
  return NextResponse.json({
    success: true,
    data: {
      ...campaign,
      origin: getBrandHostKind(host),
      targetUrl: BRAND.primaryUrl,
      brandName: BRAND.name,
      previousName: BRAND.previousName,
    },
  })
}
