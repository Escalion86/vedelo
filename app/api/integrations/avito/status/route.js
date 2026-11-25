import { sanitizeLocalAiSiteSettings } from '@helpers/siteSettingsCustom.mjs'
import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import SiteSettings from '@models/SiteSettings'
import { requireTenantIntegrationAccess } from '@server/integrationAccess'
import {
  buildAvitoWebhookUrl,
  normalizeAvitoSettings,
  requestAvitoAccessToken,
  updateAvitoCustom,
} from '@server/avito'

const jsonError = (message, status = 400, code = 'avito_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'avito', message } },
    { status }
  )

export const GET = async (req) => {
  const accessResult = await requireTenantIntegrationAccess('avito', req)
  if (!accessResult.ok) {
    return jsonError(accessResult.error, accessResult.status, 'tariff_required')
  }
  const { tenantId } = accessResult

  await dbConnect()
  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const avito = normalizeAvitoSettings(siteSettings?.custom)
  const webhookUrl =
    avito.webhookUrl ||
    buildAvitoWebhookUrl({ req, token: avito.webhookToken || '' })

  return NextResponse.json(
    {
      success: true,
      data: {
        ...avito,
        clientSecret: avito.clientSecret ? '********' : '',
        webhookUrl,
      },
    },
    { status: 200 }
  )
}

export const POST = async (req) => {
  const accessResult = await requireTenantIntegrationAccess('avito', req)
  if (!accessResult.ok) {
    return jsonError(accessResult.error, accessResult.status, 'tariff_required')
  }
  const { tenantId } = accessResult

  await dbConnect()
  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const avito = normalizeAvitoSettings(siteSettings?.custom)
  if (!avito.clientId || !avito.clientSecret) {
    return jsonError('Avito не настроен', 400, 'not_configured')
  }

  try {
    await requestAvitoAccessToken({
      clientId: avito.clientId,
      clientSecret: avito.clientSecret,
    })
    const updated = await updateAvitoCustom({
      tenantId,
      patch: {
        avitoStatus: avito.status || 'connected',
        avitoLastError: '',
        avitoLastCheckedAt: new Date().toISOString(),
      },
    })
    return NextResponse.json(
      {
        success: true,
        data: {
          siteSettings: sanitizeLocalAiSiteSettings(updated),
          avito: normalizeAvitoSettings(updated?.custom),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    const updated = await updateAvitoCustom({
      tenantId,
      patch: {
        avitoStatus: 'auth_error',
        avitoLastError: String(error?.message || error).slice(0, 1000),
        avitoLastCheckedAt: new Date().toISOString(),
      },
    })
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'auth_error',
          type: 'avito',
          message: 'Avito не принял текущие учетные данные',
        },
        data: {
          siteSettings: sanitizeLocalAiSiteSettings(updated),
          avito: normalizeAvitoSettings(updated?.custom),
        },
      },
      { status: 400 }
    )
  }
}
