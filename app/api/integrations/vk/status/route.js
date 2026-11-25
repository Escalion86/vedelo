import { sanitizeLocalAiSiteSettings } from '@helpers/siteSettingsCustom.mjs'
import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import SiteSettings from '@models/SiteSettings'
import { requireTenantIntegrationAccess } from '@server/integrationAccess'
import {
  backfillVkLeadClients,
  buildVkWebhookUrl,
  checkVkGroupAccess,
  normalizeVkSettings,
  updateVkCustom,
} from '@server/vkGroup'

const jsonError = (message, status = 400, code = 'vk_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'vk_group', message } },
    { status }
  )

export const GET = async (req) => {
  const accessResult = await requireTenantIntegrationAccess('vk', req)
  if (!accessResult.ok) {
    return jsonError(accessResult.error, accessResult.status, 'tariff_required')
  }
  const { tenantId } = accessResult

  await dbConnect()
  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const vkGroup = normalizeVkSettings(siteSettings?.custom)
  const webhookUrl =
    vkGroup.webhookUrl ||
    buildVkWebhookUrl({ req, token: vkGroup.webhookToken || '' })

  return NextResponse.json(
    {
      success: true,
      data: {
        ...vkGroup,
        accessToken: vkGroup.accessToken ? '********' : '',
        webhookUrl,
      },
    },
    { status: 200 }
  )
}

export const POST = async (req) => {
  const accessResult = await requireTenantIntegrationAccess('vk', req)
  if (!accessResult.ok) {
    return jsonError(accessResult.error, accessResult.status, 'tariff_required')
  }
  const { tenantId } = accessResult

  await dbConnect()
  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const vkGroup = normalizeVkSettings(siteSettings?.custom)
  if (!vkGroup.groupId || !vkGroup.accessToken) {
    return jsonError('VK-группа не настроена', 400, 'not_configured')
  }

  try {
    await checkVkGroupAccess({
      accessToken: vkGroup.accessToken,
      groupId: vkGroup.groupId,
    })
    const updated = await updateVkCustom({
      tenantId,
      patch: {
        vkGroupStatus: vkGroup.status || 'connected',
        vkGroupLastError: '',
        vkGroupLastCheckedAt: new Date().toISOString(),
      },
    })
    const backfill = await backfillVkLeadClients({ tenantId })
    return NextResponse.json(
      {
        success: true,
        data: {
          siteSettings: sanitizeLocalAiSiteSettings(updated),
          vkGroup: normalizeVkSettings(updated?.custom),
          backfill,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    const updated = await updateVkCustom({
      tenantId,
      patch: {
        vkGroupStatus: 'auth_error',
        vkGroupLastError: String(error?.message || error).slice(0, 1000),
        vkGroupLastCheckedAt: new Date().toISOString(),
      },
    })
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'auth_error',
          type: 'vk_group',
          message: 'VK не принял текущий токен сообщества',
        },
        data: {
          siteSettings: sanitizeLocalAiSiteSettings(updated),
          vkGroup: normalizeVkSettings(updated?.custom),
        },
      },
      { status: 400 }
    )
  }
}
