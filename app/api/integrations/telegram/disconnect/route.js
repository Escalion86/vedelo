import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import {
  deleteTelegramWebhook,
  normalizeTelegramSettings,
  sanitizeTelegramSiteSettings,
  updateTelegramCustom,
} from '@server/telegramBusiness'

export const POST = async (req) => {
  const { tenantId } = await getRequestContext(req)
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
  const current = await SiteSettings.findOne({ tenantId }).lean()
  const settings = normalizeTelegramSettings(current?.custom)
  if (settings.botToken) {
    await deleteTelegramWebhook({ botToken: settings.botToken }).catch(() => null)
  }

  const updated = await updateTelegramCustom({
    tenantId,
    patch: {
      telegramBusinessEnabled: false,
      telegramBusinessBotToken: '',
      telegramBusinessBotId: '',
      telegramBusinessBotUsername: '',
      telegramBusinessWebhookToken: '',
      telegramBusinessWebhookSecret: '',
      telegramBusinessWebhookUrl: '',
      telegramBusinessConnectionId: '',
      telegramBusinessAccountUserId: '',
      telegramBusinessRights: null,
      telegramBusinessStatus: 'disabled',
      telegramBusinessLastError: '',
      telegramBusinessLastCheckedAt: new Date().toISOString(),
    },
  })

  return NextResponse.json(
    {
      success: true,
      data: { siteSettings: sanitizeTelegramSiteSettings(updated) },
    },
    { status: 200 }
  )
}
