import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { hasIntegrationAccess } from '@server/integrationAccess'
import { normalizeTelegramSettings, updateTelegramCustom } from '@server/telegramBusiness'
import { isTelegramPushAudience } from '@helpers/telegramPushAudience.mjs'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import { POST as connect } from '../../../../integrations/telegram/connect/route'
import { POST as check } from '../../../../integrations/telegram/status/route'
import { POST as disconnect } from '../../../../integrations/telegram/disconnect/route'

const state = async (tenantId, available) => {
  const site = await SiteSettings.findOne({ tenantId }).lean()
  const settings = normalizeTelegramSettings(site?.custom)
  return { available, enabled: settings.enabled, configured: Boolean(settings.botToken), status: settings.status,
    botUsername: settings.botUsername, autoCreateClients: settings.autoCreateClients, pushAudience: settings.pushAudience,
    canReply: settings.rights?.can_reply !== false }
}
export const GET = async req => {
  const { tenantId, user } = await getRequestContext(req)
  if (!tenantId || !user?._id) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  const available = hasIntegrationAccess(await getUserTariffAccess(tenantId), 'telegram')
  return mobileSuccess(await state(tenantId, available))
}
export const POST = async req => {
  const { tenantId, user } = await getRequestContext(req)
  if (!tenantId || !user?._id) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  const body = await req.json().catch(() => null)
  if (!body || Array.isArray(body) || !['connect', 'check', 'disconnect', 'settings'].includes(body.action)) return mobileError('BAD_ACTION', 'Некорректное действие', 400)
  const keys = body.action === 'connect' ? ['action', 'botToken'] : body.action === 'settings' ? ['action', 'autoCreateClients', 'pushAudience'] : ['action']
  if (Object.keys(body).some(key => !keys.includes(key))) return mobileError('BAD_BODY', 'Недопустимые поля', 400)
  await dbConnect()
  const available = hasIntegrationAccess(await getUserTariffAccess(tenantId), 'telegram')
  if (!available && body.action !== 'disconnect') return mobileError('TARIFF_REQUIRED', 'Интеграция Telegram недоступна по тарифу', 403)
  if (body.action === 'settings') {
    if (typeof body.autoCreateClients !== 'boolean' || !isTelegramPushAudience(body.pushAudience)) return mobileError('BAD_SETTINGS', 'Проверьте настройки Telegram', 400)
    await updateTelegramCustom({ tenantId, patch: { telegramBusinessAutoCreateClients: body.autoCreateClients, telegramBusinessPushAudience: body.pushAudience } })
  } else {
    if (body.action === 'connect' && (typeof body.botToken !== 'string' || !body.botToken.trim() || body.botToken.length > 500)) return mobileError('BAD_TOKEN', 'Укажите токен из BotFather', 400)
    const delegated = new Request(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(body.action === 'connect' ? { botToken: body.botToken } : {}) })
    const response = await ({ connect, check, disconnect })[body.action](delegated)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      return mobileError('TELEGRAM_ACTION_FAILED', payload.error?.message || 'Не удалось подтвердить действие Telegram', response.status)
    }
  }
  return mobileSuccess(await state(tenantId, available))
}
