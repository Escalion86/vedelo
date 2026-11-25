import { sanitizeLocalAiSiteSettings } from '@helpers/siteSettingsCustom.mjs'
import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { updateAvitoCustom } from '@server/avito'

export const POST = async () => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'unauthorized', type: 'auth', message: 'Не авторизован' },
      },
      { status: 401 }
    )
  }

  await dbConnect()
  const updated = await updateAvitoCustom({
    tenantId,
    patch: {
      avitoEnabled: false,
      avitoStatus: 'disabled',
      avitoLastError: '',
      avitoLastCheckedAt: new Date().toISOString(),
    },
  })

  return NextResponse.json(
    { success: true, data: { siteSettings: sanitizeLocalAiSiteSettings(updated) } },
    { status: 200 }
  )
}
