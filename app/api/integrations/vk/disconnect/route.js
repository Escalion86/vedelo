import { sanitizeLocalAiSiteSettings } from '@helpers/siteSettingsCustom.mjs'
import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { updateVkCustom } from '@server/vkGroup'

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
  const updated = await updateVkCustom({
    tenantId,
    patch: {
      vkGroupEnabled: false,
      vkGroupStatus: 'disabled',
      vkGroupLastError: '',
      vkGroupLastCheckedAt: new Date().toISOString(),
    },
  })

  return NextResponse.json(
    { success: true, data: { siteSettings: sanitizeLocalAiSiteSettings(updated) } },
    { status: 200 }
  )
}
