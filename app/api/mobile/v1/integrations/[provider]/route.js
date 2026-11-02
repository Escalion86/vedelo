import { randomBytes, randomUUID } from 'node:crypto'
import SiteSettings from '@models/SiteSettings'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  hasIntegrationAccess,
} from '@server/integrationAccess'
import {
  normalizeAvitoSettings,
  updateAvitoCustom,
} from '@server/avito'
import {
  normalizeVkSettings,
  updateVkCustom,
} from '@server/vkGroup'
import { normalizePublicLeadApiKeys } from '@server/publicLeadService'
import { serializeMobileProviderIntegration } from '@server/mobile/providerIntegrations'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import { POST as connectAvito } from '../../../../integrations/avito/connect/route'
import { POST as checkAvito } from '../../../../integrations/avito/status/route'
import { POST as connectVk } from '../../../../integrations/vk/connect/route'
import { POST as checkVk } from '../../../../integrations/vk/status/route'

const providers = new Set(['avito', 'vk', 'telephony', 'ai', 'public-leads'])
const aiProviders = new Set(['artistcrm', 'aitunnel', 'deepseek'])

const readCustom = (custom, key) =>
  typeof custom?.get === 'function' ? custom.get(key) : custom?.[key]

const normalizeText = (value, maxLength = 500) =>
  String(value ?? '').trim().slice(0, maxLength)

const buildPublicBaseUrl = (req) => {
  const configured = normalizeText(process.env.DOMAIN, 300)
  if (configured) {
    return (configured.startsWith('http') ? configured : `https://${configured}`)
      .replace(/\/+$/, '')
  }
  const forwardedHost = normalizeText(req.headers.get('x-forwarded-host'), 300)
  const host = forwardedHost || normalizeText(req.headers.get('host'), 300)
  const proto = normalizeText(req.headers.get('x-forwarded-proto'), 20) || 'https'
  return host ? `${proto}://${host}`.replace(/\/+$/, '') : ''
}

const generateSecret = (prefix) => `${prefix}_${randomBytes(24).toString('hex')}`

const updateCustom = async ({ tenantId, patch }) => {
  const update = Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [`custom.${key}`, value])
  )
  await SiteSettings.findOneAndUpdate(
    { tenantId },
    { $set: { tenantId, ...update } },
    { upsert: true }
  )
}

const resolveProvider = async (params) => {
  const provider = String((await params)?.provider || '').toLowerCase()
  return providers.has(provider) ? provider : ''
}

const getState = async ({ provider, tenantId, access, req }) => {
  await dbConnect()
  const [siteSettings, owner] = await Promise.all([
    SiteSettings.findOne({ tenantId }).lean(),
    Users.findById(tenantId).select('role').lean(),
  ])
  const custom = siteSettings?.custom
  let settings = {}
  if (provider === 'avito') settings = normalizeAvitoSettings(custom)
  if (provider === 'vk') settings = normalizeVkSettings(custom)
  if (provider === 'telephony') {
    settings = {
      enabled: readCustom(custom, 'novofonEnabled') === true,
      apiKey: normalizeText(readCustom(custom, 'novofonApiKey')),
      webhookSecret: normalizeText(readCustom(custom, 'novofonWebhookSecret')),
    }
  }
  if (provider === 'ai') {
    const savedProvider = normalizeText(
      readCustom(custom, 'aiAnalysisProvider')
    ).toLowerCase()
    const isDeveloper = owner?.role === 'dev'
    const analysisProvider =
      savedProvider === 'deepseek' && !isDeveloper
        ? readCustom(custom, 'aitunnelKey')
          ? 'aitunnel'
          : 'artistcrm'
        : savedProvider ||
          (readCustom(custom, 'aitunnelKey') ? 'aitunnel' : 'artistcrm')
    const key = analysisProvider === 'deepseek'
      ? normalizeText(readCustom(custom, 'deepseekKey'))
      : analysisProvider === 'artistcrm'
        ? String(process.env.AITUNNEL_KEY || '').trim()
        : normalizeText(readCustom(custom, 'aitunnelKey'))
    const savedEnabled = readCustom(custom, 'aiIntegrationEnabled')
    settings = {
      enabled: typeof savedEnabled === 'boolean'
        ? savedEnabled
        : analysisProvider === 'artistcrm' ||
          readCustom(custom, 'aitunnelEnabled') === true,
      key,
      transcriptionProvider: normalizeText(readCustom(custom, 'aiTranscriptionProvider')),
      transcriptionModel: normalizeText(readCustom(custom, 'aiTranscriptionModel'), 120),
      analysisProvider,
      analysisModel: normalizeText(readCustom(custom, 'aiAnalysisModel'), 120),
      hasTranscriptionKey: Boolean(readCustom(custom, 'aitunnelKey')),
      canUseDeepseek: isDeveloper,
      platformConfigured: Boolean(String(process.env.AITUNNEL_KEY || '').trim()),
    }
  }
  if (provider === 'public-leads') {
    settings = {
      enabled: readCustom(custom, 'publicLeadEnabled') === true,
      endpoint: `${buildPublicBaseUrl(req)}/api/public/lead`,
      keys: normalizePublicLeadApiKeys(custom),
    }
  }
  return serializeMobileProviderIntegration({
    provider,
    settings,
    available: hasIntegrationAccess(access, provider),
  })
}

const getContext = async (req, provider) => {
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId) return { error: 'unauthorized' }
  const access = await getUserTariffAccess(context.tenantId)
  return { context, access, provider }
}

const getSiteCustom = async (tenantId) => {
  await dbConnect()
  const settings = await SiteSettings.findOne({ tenantId }).select('custom').lean()
  return settings?.custom || {}
}

const runProviderRoute = async ({ provider, action, req }) => {
  if (provider === 'avito') {
    return action === 'connect' ? connectAvito(req) : checkAvito(req)
  }
  return action === 'connect' ? connectVk(req) : checkVk(req)
}

export const GET = async (req, { params }) => {
  const provider = await resolveProvider(params)
  if (!provider) return mobileError('PROVIDER_INVALID', 'Неизвестный провайдер', 400)
  const { context, access, error } = await getContext(req, provider)
  if (error) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  return mobileSuccess(await getState({
    provider,
    tenantId: context.tenantId,
    access,
    req,
  }))
}

export const POST = async (req, { params }) => {
  const provider = await resolveProvider(params)
  if (!provider) return mobileError('PROVIDER_INVALID', 'Неизвестный провайдер', 400)
  const { context, access, error } = await getContext(req, provider)
  if (error) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  if (!hasIntegrationAccess(access, provider)) {
    return mobileError('INTEGRATION_TARIFF_REQUIRED', 'Интеграция недоступна по тарифу', 403)
  }
  const body = await req.clone().json().catch(() => ({}))
  if (
    provider === 'avito' &&
    (!String(body?.clientId || '').trim() ||
      !String(body?.clientSecret || '').trim() ||
      !String(body?.userId || '').trim())
  ) {
    return mobileError(
      'MISSING_CREDENTIALS',
      'Укажите Client ID, Client Secret и ID пользователя Avito',
      400
    )
  }
  if (
    provider === 'vk' &&
    (!String(body?.groupId || '').trim() ||
      !String(body?.accessToken || '').trim() ||
      !String(body?.confirmationCode || '').trim())
  ) {
    return mobileError(
      'MISSING_CREDENTIALS',
      'Укажите ID сообщества, токен и строку подтверждения VK',
      400
    )
  }
  if (provider === 'telephony') {
    const secret = generateSecret('novofon')
    const custom = await getSiteCustom(context.tenantId)
    const apiKey = body?.apiKey === undefined
      ? normalizeText(readCustom(custom, 'novofonApiKey'))
      : normalizeText(body.apiKey)
    await updateCustom({
      tenantId: context.tenantId,
      patch: {
        novofonEnabled: true,
        novofonApiKey: apiKey,
        novofonWebhookSecret: secret,
      },
    })
    const baseUrl = buildPublicBaseUrl(req)
    const params = new URLSearchParams({
      tenantId: String(context.tenantId),
      secret,
    })
    const state = await getState({
      provider,
      tenantId: context.tenantId,
      access,
      req,
    })
    return mobileSuccess({
      ...state,
      setup: {
        webhookSecret: secret,
        webhookUrl: `${baseUrl}/api/telephony/novofon/webhook?${params}`,
      },
    })
  }
  if (provider === 'ai') {
    const aiProvider = normalizeText(body?.provider || 'artistcrm', 40).toLowerCase()
    if (!aiProviders.has(aiProvider)) {
      return mobileError('AI_PROVIDER_INVALID', 'Неизвестный ИИ-провайдер', 400)
    }
    if (aiProvider === 'deepseek' && context.user?.role !== 'dev') {
      return mobileError(
        'AI_PROVIDER_FORBIDDEN',
        'Интеграция DeepSeek пока доступна только разработчику',
        403
      )
    }
    const key = normalizeText(body?.key)
    if (aiProvider !== 'artistcrm' && !key) {
      return mobileError(
        'MISSING_CREDENTIALS',
        `Укажите ключ ${aiProvider === 'deepseek' ? 'DeepSeek' : 'AITunnel'}`,
        400
      )
    }
    const isAitunnel = aiProvider === 'aitunnel'
    const isPlatform = aiProvider === 'artistcrm'
    await updateCustom({
      tenantId: context.tenantId,
      patch: {
        aiIntegrationEnabled: true,
        aiAnalysisProvider: aiProvider,
        aiAnalysisModel: normalizeText(body?.analysisModel, 120) ||
          (aiProvider === 'deepseek' ? 'deepseek-v4-flash' : 'gpt-4o-mini'),
        ...(isPlatform
          ? {
              aiTranscriptionProvider: 'artistcrm',
              aiTranscriptionModel: 'whisper-1',
            }
          : {}),
        ...(isAitunnel
          ? {
              aitunnelEnabled: true,
              aitunnelKey: key,
              aiTranscriptionProvider: 'aitunnel',
              aiTranscriptionModel:
                normalizeText(body?.transcriptionModel, 120) || 'whisper-1',
            }
          : aiProvider === 'deepseek'
            ? { deepseekKey: key }
            : {}),
      },
    })
    return mobileSuccess(await getState({
      provider,
      tenantId: context.tenantId,
      access,
      req,
    }))
  }
  if (provider === 'public-leads') {
    const name = normalizeText(body?.name, 120)
    if (!name) return mobileError('NAME_REQUIRED', 'Укажите название источника', 400)
    const custom = await getSiteCustom(context.tenantId)
    const keys = normalizePublicLeadApiKeys(custom)
    if (keys.length >= 20) {
      return mobileError('KEY_LIMIT_REACHED', 'Можно создать не более 20 API-ключей', 409)
    }
    const issuedKey = generateSecret('lead')
    const nextKeys = [...keys, {
      id: randomUUID(),
      name,
      key: issuedKey,
      enabled: true,
    }]
    await updateCustom({
      tenantId: context.tenantId,
      patch: {
        publicLeadEnabled: true,
        publicLeadApiKeys: nextKeys,
        publicLeadApiKey: nextKeys[0]?.key || '',
      },
    })
    const state = await getState({
      provider,
      tenantId: context.tenantId,
      access,
      req,
    })
    return mobileSuccess({ ...state, issuedKey })
  }
  const response = await runProviderRoute({ provider, action: 'connect', req })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    return mobileError(
      String(result?.error?.code || 'PROVIDER_CONNECT_FAILED').toUpperCase(),
      result?.error?.message || 'Не удалось подключить интеграцию',
      response.status
    )
  }
  return mobileSuccess(await getState({
    provider,
    tenantId: context.tenantId,
    access,
    req,
  }))
}

export const PATCH = async (req, { params }) => {
  const provider = await resolveProvider(params)
  if (!provider) return mobileError('PROVIDER_INVALID', 'Неизвестный провайдер', 400)
  const { context, access, error } = await getContext(req, provider)
  if (error) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  if (!hasIntegrationAccess(access, provider)) {
    return mobileError('INTEGRATION_TARIFF_REQUIRED', 'Интеграция недоступна по тарифу', 403)
  }
  const body = await req.clone().json().catch(() => ({}))
  if (provider === 'telephony') {
    if (!body || Array.isArray(body) || typeof body.enabled !== 'boolean' ||
      Object.keys(body).some(key => key !== 'enabled'))
      return mobileError('INVALID_SETTINGS', 'Передайте только состояние интеграции', 400)
    const custom = await getSiteCustom(context.tenantId)
    const secret = readCustom(custom, 'novofonWebhookSecret')
    if (typeof secret !== 'string' || !secret.trim())
      return mobileError('SETUP_REQUIRED', 'Сначала подключите Novofon', 409)
    // Pause/resume keeps the webhook and API key. A concurrent disconnect or
    // rotation must not be undone by a late response from the old form.
    const saved = await SiteSettings.updateOne(
      { tenantId: context.tenantId, 'custom.novofonWebhookSecret': secret },
      { $set: { 'custom.novofonEnabled': body.enabled } }
    )
    if (!saved.matchedCount)
      return mobileError('SETTINGS_CHANGED', 'Подключение изменилось. Обновите состояние', 409)
    return mobileSuccess(await getState({ provider, tenantId: context.tenantId, access, req }))
  }
  if (provider === 'ai') {
    const custom = await getSiteCustom(context.tenantId)
    const aiProvider = normalizeText(
      body?.provider || readCustom(custom, 'aiAnalysisProvider') || 'artistcrm',
      40
    ).toLowerCase()
    if (!aiProviders.has(aiProvider)) {
      return mobileError('AI_PROVIDER_INVALID', 'Неизвестный ИИ-провайдер', 400)
    }
    if (aiProvider === 'deepseek' && context.user?.role !== 'dev') {
      return mobileError(
        'AI_PROVIDER_FORBIDDEN',
        'Интеграция DeepSeek пока доступна только разработчику',
        403
      )
    }
    const key = aiProvider === 'deepseek'
      ? normalizeText(readCustom(custom, 'deepseekKey'))
      : aiProvider === 'artistcrm'
        ? String(process.env.AITUNNEL_KEY || '').trim()
        : normalizeText(readCustom(custom, 'aitunnelKey'))
    const enabled = body?.enabled === undefined
      ? readCustom(custom, 'aiIntegrationEnabled') !== false
      : body.enabled === true
    if (enabled && !key) {
      return mobileError(
        'MISSING_CREDENTIALS',
        aiProvider === 'artistcrm'
          ? 'Общий ИИ временно не настроен администратором'
          : `Сначала укажите ключ ${aiProvider === 'deepseek' ? 'DeepSeek' : 'AITunnel'}`,
        400
      )
    }
    await updateCustom({
      tenantId: context.tenantId,
      patch: {
        aiIntegrationEnabled: enabled,
        aiAnalysisProvider: aiProvider,
        aiTranscriptionModel: normalizeText(body?.transcriptionModel, 120) ||
          normalizeText(readCustom(custom, 'aiTranscriptionModel'), 120) || 'whisper-1',
        aiAnalysisModel: normalizeText(body?.analysisModel, 120) ||
          normalizeText(readCustom(custom, 'aiAnalysisModel'), 120) ||
          (aiProvider === 'deepseek' ? 'deepseek-v4-flash' : 'gpt-4o-mini'),
        ...(aiProvider === 'aitunnel'
          ? {
              aitunnelEnabled: true,
              aiTranscriptionProvider: 'aitunnel',
            }
          : aiProvider === 'artistcrm'
            ? { aiTranscriptionProvider: 'artistcrm' }
            : {}),
      },
    })
    return mobileSuccess(await getState({
      provider,
      tenantId: context.tenantId,
      access,
      req,
    }))
  }
  if (provider === 'public-leads') {
    const custom = await getSiteCustom(context.tenantId)
    const keys = normalizePublicLeadApiKeys(custom)
    const keyId = normalizeText(body?.keyId, 80)
    let nextKeys = keys
    if (keyId) {
      if (!keys.some((item) => item.id === keyId)) {
        return mobileError('KEY_NOT_FOUND', 'API-ключ не найден', 404)
      }
      nextKeys = keys.map((item) => item.id === keyId
        ? {
            ...item,
            ...(body?.name === undefined
              ? {}
              : { name: normalizeText(body.name, 120) || item.name }),
            ...(body?.enabled === undefined
              ? {}
              : { enabled: body.enabled === true }),
          }
        : item)
    }
    const enabled = keyId
      ? readCustom(custom, 'publicLeadEnabled') === true
      : body?.enabled === true
    await updateCustom({
      tenantId: context.tenantId,
      patch: {
        publicLeadEnabled: enabled,
        publicLeadApiKeys: nextKeys,
        publicLeadApiKey: nextKeys[0]?.key || '',
      },
    })
    return mobileSuccess(await getState({
      provider,
      tenantId: context.tenantId,
      access,
      req,
    }))
  }
  const response = await runProviderRoute({ provider, action: 'check', req })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    return mobileError(
      String(result?.error?.code || 'PROVIDER_CHECK_FAILED').toUpperCase(),
      result?.error?.message || 'Проверка интеграции завершилась ошибкой',
      response.status
    )
  }
  return mobileSuccess(await getState({
    provider,
    tenantId: context.tenantId,
    access,
    req,
  }))
}

export const DELETE = async (req, { params }) => {
  const provider = await resolveProvider(params)
  if (!provider) return mobileError('PROVIDER_INVALID', 'Неизвестный провайдер', 400)
  const { context, access, error } = await getContext(req, provider)
  if (error) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  const checkedAt = new Date().toISOString()
  if (provider === 'avito') {
    await updateAvitoCustom({
      tenantId: context.tenantId,
      patch: {
        avitoEnabled: false,
        avitoClientId: '',
        avitoClientSecret: '',
        avitoUserId: '',
        avitoWebhookToken: '',
        avitoWebhookUrl: '',
        avitoWebhookId: '',
        avitoStatus: 'disabled',
        avitoLastError: '',
        avitoLastCheckedAt: checkedAt,
      },
    })
  } else if (provider === 'vk') {
    await updateVkCustom({
      tenantId: context.tenantId,
      patch: {
        vkGroupEnabled: false,
        vkGroupId: '',
        vkGroupAccessToken: '',
        vkGroupConfirmationCode: '',
        vkGroupWebhookToken: '',
        vkGroupWebhookSecret: '',
        vkGroupWebhookUrl: '',
        vkGroupStatus: 'disabled',
        vkGroupLastError: '',
        vkGroupLastCheckedAt: checkedAt,
      },
    })
  } else if (provider === 'telephony') {
    await updateCustom({
      tenantId: context.tenantId,
      patch: {
        novofonEnabled: false,
        novofonApiKey: '',
        novofonWebhookSecret: '',
      },
    })
  } else if (provider === 'ai') {
    await updateCustom({
      tenantId: context.tenantId,
      patch: {
        aiIntegrationEnabled: false,
        aitunnelEnabled: false,
        aitunnelKey: '',
        deepseekKey: '',
        aiTranscriptionProvider: '',
        aiTranscriptionModel: 'whisper-1',
        aiAnalysisProvider: '',
        aiAnalysisModel: 'gpt-4o-mini',
      },
    })
  } else {
    const body = await req.json().catch(() => ({}))
    const keyId = normalizeText(body?.keyId, 80)
    const custom = await getSiteCustom(context.tenantId)
    const keys = normalizePublicLeadApiKeys(custom)
    const nextKeys = keyId ? keys.filter((item) => item.id !== keyId) : []
    if (keyId && nextKeys.length === keys.length) {
      return mobileError('KEY_NOT_FOUND', 'API-ключ не найден', 404)
    }
    await updateCustom({
      tenantId: context.tenantId,
      patch: {
        publicLeadEnabled: keyId
          ? readCustom(custom, 'publicLeadEnabled') === true && nextKeys.length > 0
          : false,
        publicLeadApiKeys: nextKeys,
        publicLeadApiKey: nextKeys[0]?.key || '',
      },
    })
  }
  return mobileSuccess(await getState({
    provider,
    tenantId: context.tenantId,
    access,
    req,
  }))
}
