const AI_ANALYSIS_PROVIDERS = Object.freeze({
  artistcrm: {
    apiUrl: 'https://api.aitunnel.ru/v1/chat/completions',
    apiKeyEnv: 'AITUNNEL_KEY',
    modelEnv: 'AITUNNEL_CALL_ANALYSIS_MODEL',
    defaultModel: 'gpt-4o-mini',
    settingsKey: '',
  },
  openai: {
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_CALL_ANALYSIS_MODEL',
    defaultModel: 'gpt-4o-mini',
    settingsKey: '',
  },
  deepseek: {
    apiUrl: 'https://api.deepseek.com/chat/completions',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelEnv: 'DEEPSEEK_CALL_ANALYSIS_MODEL',
    defaultModel: 'deepseek-v4-flash',
    settingsKey: 'deepseekKey',
  },
  aitunnel: {
    apiUrl: 'https://api.aitunnel.ru/v1/chat/completions',
    apiKeyEnv: 'AITUNNEL_KEY',
    modelEnv: 'AITUNNEL_CALL_ANALYSIS_MODEL',
    defaultModel: 'gpt-4o-mini',
    settingsKey: 'aitunnelKey',
  },
})

const normalizeProviderName = (value) =>
  String(value ?? '').trim().toLowerCase()

const getDefaultProviderName = (settings = {}) => {
  if (settings.deepseekKey) return 'deepseek'
  if (settings.aitunnelKey) return 'aitunnel'
  const configuredProvider = normalizeProviderName(
    process.env.AI_ANALYSIS_PROVIDER
  )
  if (AI_ANALYSIS_PROVIDERS[configuredProvider]) return configuredProvider
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek'
  if (process.env.AITUNNEL_KEY) return 'aitunnel'
  return 'openai'
}

export const getAiAnalysisProviderConfig = (settings = {}) => {
  const requestedName =
    normalizeProviderName(settings.aiAnalysisProvider) ||
    getDefaultProviderName(settings)
  const name = AI_ANALYSIS_PROVIDERS[requestedName] ? requestedName : 'openai'
  const provider = AI_ANALYSIS_PROVIDERS[name]
  const explicitlyDisabled = settings.aiIntegrationEnabled === false
  const openAiBaseUrl = String(process.env.OPENAI_BASE_URL || '').replace(
    /\/+$/,
    ''
  )

  return {
    name,
    apiUrl:
      process.env.AI_ANALYSIS_API_URL ||
      process.env[`${name.toUpperCase()}_API_URL`] ||
      (name === 'openai' && openAiBaseUrl
        ? `${openAiBaseUrl}/chat/completions`
        : '') ||
      provider.apiUrl,
    apiKey: explicitlyDisabled
      ? ''
      : String(
          provider.settingsKey
            ? settings[provider.settingsKey] || ''
            : process.env[provider.apiKeyEnv] || ''
        ).trim(),
    model:
      String(settings.aiAnalysisModel || '').trim() ||
      process.env[provider.modelEnv] ||
      (name === 'openai' ? process.env.OPENAI_MODEL : '') ||
      provider.defaultModel,
  }
}

// Консервативный перечень проверенных image-input моделей. Не менять провайдера
// и не подменять пользовательскую модель при неподдерживаемом vision.
export const isAiVisionProvider = (provider) =>
  ['artistcrm', 'aitunnel', 'openai'].includes(provider.name) &&
  ['gpt-4o-mini', 'gpt-4o-mini-2024-07-18', 'gpt-4o',
    'gpt-4o-2024-05-13', 'gpt-4o-2024-08-06', 'gpt-4o-2024-11-20'].includes(provider.model)

export const requestAiChatCompletion = async ({
  settings = {},
  messages,
  temperature = 0.1,
  maxTokens = 2000,
  jsonResponse = true,
  feature = 'call_analysis',
  operationId,
  groupId = '',
  prepaidImport = false,
  timeoutMs,
  requireVision = false,
}) => {
  const provider = getAiAnalysisProviderConfig(settings)
  if (requireVision && (!isAiVisionProvider(provider) ||
    (settings.aiAnalysisProvider && !AI_ANALYSIS_PROVIDERS[normalizeProviderName(settings.aiAnalysisProvider)]))) {
    throw Object.assign(new Error('Выбранная модель не поддерживает распознавание фото'), { code: 'AI_VISION_UNSUPPORTED' })
  }
  if (!provider.apiKey) return null
  let reservation = null
  let platformBilling = null

  if (provider.name === 'artistcrm' && !prepaidImport) {
    platformBilling = await import('./aiBilling.js')
    reservation = await platformBilling.reservePlatformAiUsage({
      tenantId: settings.tenantId,
      userId: settings.userId,
      // OCR — отдельный вызов, но billing feature совместим с существующей
      // схемой и порогами черновика; новые enum/миграции не требуются.
      feature: feature === 'event_photo_ocr' ? 'event_draft' : feature,
      model: provider.model,
      operationId,
      groupId,
    })
  }

  const body = {
    model: provider.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonResponse ? { response_format: { type: 'json_object' } } : {}),
  }

  if (provider.name === 'deepseek' && provider.model.startsWith('deepseek-v4')) {
    body.thinking = { type: 'disabled' }
  }

  let response
  let payload
  try {
    response = await fetch(provider.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    })
    payload = await response.json().catch(() => null)
  } catch (error) {
    await platformBilling?.failPlatformAiUsage(
      reservation,
      'AI_PROVIDER_NETWORK_FAILED'
    )
    throw error
  }

  if (!response.ok) {
    await platformBilling?.failPlatformAiUsage(
      reservation,
      `AI_PROVIDER_HTTP_${response.status}`
    )
    const message =
      payload?.error?.message ||
      `${provider.name} request failed: ${response.status}`
    throw new Error(message)
  }

  const content = String(payload?.choices?.[0]?.message?.content || '').trim()
  if (!content) {
    await platformBilling?.failPlatformAiUsage(reservation, 'AI_PROVIDER_EMPTY_RESPONSE')
    throw new Error('AI вернул пустой ответ')
  }
  if (reservation) {
    await platformBilling.settlePlatformAiUsage(reservation, payload?.usage)
  }
  return {
    content,
    provider: provider.name,
    model: provider.model,
    usage: payload?.usage || null,
  }
}
