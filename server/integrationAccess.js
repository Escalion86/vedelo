import getTenantContext from '@server/getTenantContext'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'

const INTEGRATION_ACCESS = Object.freeze({
  avito: {
    flag: 'allowAvitoIntegration',
    label: 'Avito',
    error: 'Интеграция Avito недоступна по тарифу',
    customKeys: [
      'avitoEnabled',
      'avitoClientId',
      'avitoClientSecret',
      'avitoUserId',
      'avitoWebhookToken',
      'avitoWebhookUrl',
      'avitoWebhookId',
      'avitoStatus',
      'avitoLastError',
      'avitoConnectedAt',
      'avitoLastCheckedAt',
      'avitoLastWebhookAt',
      'avitoLastChatId',
    ],
  },
  vk: {
    flag: 'allowVkIntegration',
    label: 'VK',
    error: 'Интеграция VK недоступна по тарифу',
    customKeys: [
      'vkGroupEnabled',
      'vkGroupId',
      'vkGroupAccessToken',
      'vkGroupConfirmationCode',
      'vkGroupWebhookToken',
      'vkGroupWebhookSecret',
      'vkGroupWebhookUrl',
      'vkGroupStatus',
      'vkGroupLastError',
      'vkGroupConnectedAt',
      'vkGroupLastCheckedAt',
      'vkGroupLastWebhookAt',
      'vkGroupLastPeerId',
    ],
  },
  telegram: {
    flag: 'allowTelegramIntegration',
    label: 'Telegram',
    error: 'Интеграция Telegram недоступна по тарифу',
    customKeys: [
      'telegramBusinessEnabled',
      'telegramBusinessPushAudience',
      'telegramBusinessBotToken',
      'telegramBusinessBotId',
      'telegramBusinessBotUsername',
      'telegramBusinessWebhookToken',
      'telegramBusinessWebhookSecret',
      'telegramBusinessWebhookUrl',
      'telegramBusinessConnectionId',
      'telegramBusinessAccountUserId',
      'telegramBusinessRights',
      'telegramBusinessStatus',
      'telegramBusinessLastError',
      'telegramBusinessConnectedAt',
      'telegramBusinessLastCheckedAt',
      'telegramBusinessLastWebhookAt',
      'telegramBusinessLastMessageAt',
    ],
  },
  telephony: {
    flag: 'allowTelephony',
    label: 'IP-телефония',
    error: 'IP-телефония недоступна по тарифу',
    customKeys: ['novofonEnabled', 'novofonWebhookSecret', 'novofonApiKey'],
  },
  ai: {
    flag: 'allowAi',
    label: 'AI',
    error: 'ИИ-возможности недоступны по тарифу',
    customKeys: [
      'aitunnelEnabled',
      'aitunnelKey',
      'deepseekKey',
      'aiIntegrationEnabled',
      'aiTranscriptionProvider',
      'aiTranscriptionModel',
      'aiAnalysisProvider',
      'aiAnalysisModel',
    ],
  },
  'public-leads': {
    flag: 'allowPublicLeadApi',
    label: 'Входящие заявки API',
    error: 'Подключение сайта по API недоступно на текущем тарифе',
    customKeys: [
      'publicLeadEnabled',
      'publicLeadApiKey',
      'publicLeadApiKeys',
    ],
  },
})

const readCustomValue = (custom, key) => {
  if (!custom) return undefined
  if (typeof custom.get === 'function') return custom.get(key)
  return custom[key]
}

const normalizeComparableValue = (value) => {
  if (value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalizeComparableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeComparableValue(value[key])])
  )
}

const valuesEqual = (left, right) =>
  JSON.stringify(normalizeComparableValue(left)) ===
  JSON.stringify(normalizeComparableValue(right))

const isDisableOnlyChange = (key, nextValue) =>
  key.toLowerCase().endsWith('enabled') && nextValue === false

export const hasIntegrationAccess = (access, integration) => {
  const config = INTEGRATION_ACCESS[integration]
  if (!config) return false
  return Boolean(access?.[config.flag])
}

export const getIntegrationAccessError = (integration) =>
  INTEGRATION_ACCESS[integration]?.error || 'Интеграция недоступна по тарифу'

export const requireTenantIntegrationAccess = async (integration, req = null) => {
  const { tenantId, user } = req
    ? await getRequestContext(req)
    : await getTenantContext()
  if (!tenantId || !user?._id) {
    return {
      ok: false,
      status: 401,
      error: 'Не авторизован',
      tenantId: null,
      user: null,
    }
  }

  const access = await getUserTariffAccess(tenantId)
  if (!hasIntegrationAccess(access, integration)) {
    return {
      ok: false,
      status: 403,
      error: getIntegrationAccessError(integration),
      tenantId,
      user,
      access,
    }
  }

  return { ok: true, status: 200, error: '', tenantId, user, access }
}

export const isTenantIntegrationAllowed = async (tenantId, integration) => {
  if (!tenantId) return false
  const access = await getUserTariffAccess(tenantId)
  return hasIntegrationAccess(access, integration)
}

export const getProtectedCustomAccessFailures = ({
  existingCustom,
  nextCustom,
  access,
}) => {
  if (!nextCustom || typeof nextCustom !== 'object') return []

  const failures = []
  for (const [integration, config] of Object.entries(INTEGRATION_ACCESS)) {
    if (hasIntegrationAccess(access, integration)) continue

    const hasProtectedChange = config.customKeys.some((key) => {
      const currentValue = readCustomValue(existingCustom, key)
      const nextValue = readCustomValue(nextCustom, key)
      if (valuesEqual(currentValue, nextValue)) return false
      return !isDisableOnlyChange(key, nextValue)
    })

    if (hasProtectedChange) failures.push(config.label)
  }

  return failures
}
