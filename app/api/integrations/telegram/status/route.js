import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import { requireTenantIntegrationAccess } from '@server/integrationAccess'
import {
  buildTelegramWebhookUrl,
  checkTelegramBot,
  getTelegramTransportStatus,
  normalizeTelegramSettings,
  setTelegramWebhook,
  updateTelegramCustom,
} from '@server/telegramBusiness'

const jsonError = (message, status = 400, code = 'telegram_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'telegram_business', message } },
    { status }
  )

const publicStatus = (settings) => ({
  enabled: settings.enabled,
  autoCreateClients: settings.autoCreateClients,
  pushAudience: settings.pushAudience,
  hasBotToken: Boolean(settings.botToken),
  botId: settings.botId,
  botUsername: settings.botUsername,
  status: settings.status,
  lastError: settings.lastError,
  connectedAt: settings.connectedAt,
  lastCheckedAt: settings.lastCheckedAt,
  lastWebhookAt: settings.lastWebhookAt,
  lastMessageAt: settings.lastMessageAt,
  rights: settings.rights,
  ...getTelegramTransportStatus(),
})

export const GET = async (req) => {
  const accessResult = await requireTenantIntegrationAccess('telegram', req)
  if (!accessResult.ok) {
    return jsonError(
      accessResult.error,
      accessResult.status,
      accessResult.status === 401 ? 'unauthorized' : 'tariff_required'
    )
  }
  await dbConnect()
  const siteSettings = await SiteSettings.findOne({
    tenantId: accessResult.tenantId,
  }).lean()
  const settings = normalizeTelegramSettings(siteSettings?.custom)
  return NextResponse.json(
    { success: true, data: publicStatus(settings) },
    { status: 200 }
  )
}

export const POST = async (req) => {
  const accessResult = await requireTenantIntegrationAccess('telegram', req)
  if (!accessResult.ok) {
    return jsonError(
      accessResult.error,
      accessResult.status,
      accessResult.status === 401 ? 'unauthorized' : 'tariff_required'
    )
  }
  const { tenantId } = accessResult
  await dbConnect()
  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const settings = normalizeTelegramSettings(siteSettings?.custom)
  if (!settings.botToken || !settings.webhookToken || !settings.webhookSecret) {
    return jsonError('Telegram Business не настроен', 400, 'not_configured')
  }

  const webhookUrl = buildTelegramWebhookUrl({
    req,
    token: settings.webhookToken,
  })
  try {
    const bot = await checkTelegramBot({ botToken: settings.botToken })
    await setTelegramWebhook({
      botToken: settings.botToken,
      webhookUrl,
      webhookSecret: settings.webhookSecret,
    })
    const updated = await updateTelegramCustom({
      tenantId,
      patch: {
        telegramBusinessEnabled: true,
        telegramBusinessBotId: String(bot?.id || ''),
        telegramBusinessBotUsername: String(bot?.username || ''),
        telegramBusinessWebhookUrl: webhookUrl,
        telegramBusinessStatus: settings.businessConnectionId
          ? 'connected'
          : 'bot_ready',
        telegramBusinessLastError: '',
        telegramBusinessLastCheckedAt: new Date().toISOString(),
      },
    })
    return NextResponse.json(
      {
        success: true,
        data: publicStatus(normalizeTelegramSettings(updated?.custom)),
      },
      { status: 200 }
    )
  } catch (error) {
    const connectionMessage = [
      'telegram_proxy_invalid',
      'telegram_proxy_unavailable',
      'telegram_api_unavailable',
    ].includes(error?.code)
      ? String(error.message)
      : 'Не удалось проверить Telegram-бота'
    await updateTelegramCustom({
      tenantId,
      patch: {
        telegramBusinessStatus: 'auth_error',
        telegramBusinessLastError: connectionMessage.slice(0, 500),
        telegramBusinessLastCheckedAt: new Date().toISOString(),
      },
    })
    return jsonError(connectionMessage, 400, 'auth_error')
  }
}
