import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'

export const getSocialProviderStatus = () => ({
  vkConfigured: Boolean(process.env.VK_ID_APP_ID && process.env.VK_ID_CLIENT_SECRET && process.env.VK_ID_REDIRECT_URI),
  yandexConfigured: Boolean(process.env.YANDEX_ID_CLIENT_ID && process.env.YANDEX_ID_CLIENT_SECRET && process.env.YANDEX_ID_REDIRECT_URI),
})

export const getSocialAuthSettings = async () => {
  await dbConnect()
  const settings = await SiteSettings.findOne({ tenantId: null })
    .select('socialAuth').lean()
  const configured = getSocialProviderStatus()
  // Preserve existing installations until an administrator saves an explicit choice.
  const vkEnabled = settings?.socialAuth?.vkEnabled ?? (process.env.VK_AUTH_ENABLED === 'true')
  const yandexEnabled = settings?.socialAuth?.yandexEnabled === true
  return {
    vkEnabled, yandexEnabled, ...configured,
    allowVkAuth: vkEnabled && configured.vkConfigured,
    allowYandexAuth: yandexEnabled && configured.yandexConfigured,
  }
}
