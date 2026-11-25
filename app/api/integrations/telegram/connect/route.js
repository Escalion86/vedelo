import { sanitizeLocalAiSiteSettings } from '@helpers/siteSettingsCustom.mjs'
import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import { requireTenantIntegrationAccess } from '@server/integrationAccess'
import {
  buildTelegramWebhookUrl,
  checkTelegramBot,
  createTelegramWebhookSecret,
  createTelegramWebhookToken,
  deleteTelegramWebhook,
  getTelegramTransportStatus,
  normalizeTelegramSettings,
  sanitizeTelegramSiteSettings,
  setTelegramWebhook,
  updateTelegramCustom,
} from '@server/telegramBusiness'

const jsonError = (message, status = 400, code = 'telegram_error', data) =>
  NextResponse.json(
    {
      success: false,
      error: { code, type: 'telegram_business', message },
      ...(data ? { data } : {}),
    },
    { status }
  )

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
  const body = await req.json().catch(() => ({}))
  const botToken = String(body?.botToken || '').trim()
  if (!botToken) {
    return jsonError('Укажите токен бота из BotFather', 400, 'missing_token')
  }

  await dbConnect()
  const current = await SiteSettings.findOne({ tenantId }).lean()
  const telegram = normalizeTelegramSettings(current?.custom)
  const webhookToken = telegram.webhookToken || createTelegramWebhookToken()
  const webhookSecret = telegram.webhookSecret || createTelegramWebhookSecret()
  const webhookUrl = buildTelegramWebhookUrl({ req, token: webhookToken })
  const keepsBusinessConnection = telegram.botToken === botToken
  const transport = getTelegramTransportStatus()

  try {
    const bot = await checkTelegramBot({ botToken })
    if (!bot?.is_bot) {
      return jsonError('Указанный токен не принадлежит боту', 400, 'not_a_bot')
    }
    if (telegram.botToken && !keepsBusinessConnection) {
      await deleteTelegramWebhook({ botToken: telegram.botToken }).catch(
        () => null
      )
    }
    await setTelegramWebhook({ botToken, webhookUrl, webhookSecret })

    const updated = await updateTelegramCustom({
      tenantId,
      patch: {
        telegramBusinessEnabled: true,
        telegramBusinessBotToken: botToken,
        telegramBusinessBotId: String(bot.id || ''),
        telegramBusinessBotUsername: String(bot.username || ''),
        telegramBusinessWebhookToken: webhookToken,
        telegramBusinessWebhookSecret: webhookSecret,
        telegramBusinessWebhookUrl: webhookUrl,
        telegramBusinessConnectionId: keepsBusinessConnection
          ? telegram.businessConnectionId
          : '',
        telegramBusinessAccountUserId: keepsBusinessConnection
          ? telegram.businessAccountUserId
          : '',
        telegramBusinessRights: keepsBusinessConnection
          ? telegram.rights
          : null,
        telegramBusinessStatus:
          keepsBusinessConnection && telegram.businessConnectionId
          ? 'connected'
          : 'bot_ready',
        telegramBusinessLastError: '',
        telegramBusinessLastCheckedAt: new Date().toISOString(),
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          siteSettings: sanitizeLocalAiSiteSettings(sanitizeTelegramSiteSettings(updated)),
          telegramBusiness: {
            status:
              keepsBusinessConnection && telegram.businessConnectionId
                ? 'connected'
                : 'bot_ready',
            botUsername: String(bot.username || ''),
            ...transport,
          },
        },
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
      : 'Telegram не принял токен или адрес webhook. Проверьте токен и публичный HTTPS-домен.'
    const updated = await updateTelegramCustom({
      tenantId,
      patch: {
        telegramBusinessEnabled: false,
        telegramBusinessWebhookToken: webhookToken,
        telegramBusinessWebhookSecret: webhookSecret,
        telegramBusinessWebhookUrl: webhookUrl,
        telegramBusinessStatus: 'auth_error',
        telegramBusinessLastError: connectionMessage.slice(0, 500),
        telegramBusinessLastCheckedAt: new Date().toISOString(),
      },
    })
    return jsonError(
      connectionMessage,
      400,
      'auth_error',
      { siteSettings: sanitizeLocalAiSiteSettings(sanitizeTelegramSiteSettings(updated)) }
    )
  }
}
