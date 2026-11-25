import SiteSettings from '@models/SiteSettings'
import Users from '@models/Users'
import { sanitizeLocalAiCustom } from '@helpers/siteSettingsCustom.mjs'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { normalizeAvitoSettings } from '@server/avito'
import { normalizeVkSettings } from '@server/vkGroup'
import { normalizeTelegramSettings } from '@server/telegramBusiness'
import { normalizeCalendarSettings } from '@server/googleUserCalendarClient'
import { serializeMobileGoogleCalendar } from '@server/mobile/googleCalendar'
import { serializeMobileProviderIntegration } from '@server/mobile/providerIntegrations'
import { normalizePublicLeadApiKeys } from '@server/publicLeadService'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'

const readCustom = (custom, key) =>
  typeof custom?.get === 'function' ? custom.get(key) : custom?.[key]

export const GET = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId) {
    return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  }
  await dbConnect()
  const [settings, user, access] = await Promise.all([
    SiteSettings.findOne({ tenantId: context.tenantId }).lean(),
    Users.findById(context.user._id).select('googleCalendar').lean(),
    getUserTariffAccess(context.tenantId),
  ])
  const avito = normalizeAvitoSettings(settings?.custom)
  const vk = normalizeVkSettings(settings?.custom)
  const telegram = normalizeTelegramSettings(settings?.custom)
  const mobileAi = sanitizeLocalAiCustom(settings?.custom)
  const calendar = normalizeCalendarSettings(user)
  return mobileSuccess({
    googleCalendar: serializeMobileGoogleCalendar(calendar, access),
    avito: {
      available: Boolean(access?.allowAvitoIntegration),
      enabled: avito.enabled,
      configured: Boolean(avito.clientId && avito.clientSecret && avito.userId),
      status: avito.status,
      lastCheckedAt: avito.lastCheckedAt,
      lastWebhookAt: avito.lastWebhookAt,
    },
    vk: {
      available: Boolean(access?.allowVkIntegration),
      enabled: vk.enabled,
      configured: Boolean(vk.groupId && vk.accessToken),
      status: vk.status,
      lastCheckedAt: vk.lastCheckedAt,
      lastWebhookAt: vk.lastWebhookAt,
    },
    telegram: {
      available: Boolean(access?.allowTelegramIntegration),
      enabled: telegram.enabled,
      configured: Boolean(telegram.botToken),
      status: telegram.status,
      botUsername: telegram.botUsername,
      connectedAt: telegram.connectedAt,
      lastCheckedAt: telegram.lastCheckedAt,
      lastWebhookAt: telegram.lastWebhookAt,
      lastMessageAt: telegram.lastMessageAt,
    },
    telephony: serializeMobileProviderIntegration({
      provider: 'telephony',
      available: access?.allowTelephony,
      settings: {
        enabled: readCustom(settings?.custom, 'novofonEnabled') === true,
        apiKey: readCustom(settings?.custom, 'novofonApiKey'),
        webhookSecret: readCustom(settings?.custom, 'novofonWebhookSecret'),
      },
    }),
    ai: serializeMobileProviderIntegration({
      provider: 'ai',
      available: access?.allowAi,
      settings: {
        enabled: readCustom(settings?.custom, 'aitunnelEnabled') === true,
        key: readCustom(settings?.custom, 'aitunnelKey'),
        transcriptionProvider: mobileAi.aiTranscriptionProvider,
        transcriptionModel: mobileAi.aiTranscriptionModel,
        analysisProvider: mobileAi.aiAnalysisProvider,
        analysisModel: mobileAi.aiAnalysisModel,
      },
    }),
    publicLeadApi: serializeMobileProviderIntegration({
      provider: 'public-leads',
      available: access?.allowPublicLeadApi,
      settings: {
        enabled: readCustom(settings?.custom, 'publicLeadEnabled') === true,
        keys: normalizePublicLeadApiKeys(settings?.custom),
      },
    }),
  })
}
