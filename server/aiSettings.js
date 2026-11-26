import SiteSettings from '@models/SiteSettings'
import Users from '@models/Users'

const getCustomValue = (custom, key) => {
  if (!custom) return undefined
  if (typeof custom.get === 'function') return custom.get(key)
  return custom[key]
}

const normalizeStringList = (items) =>
  Array.isArray(items)
    ? items
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : []

const readString = (custom, key) => String(getCustomValue(custom, key) || '').trim()

export const isLocalAiDeveloper = (user, tenantId) =>
  Boolean(tenantId && user?.role === 'dev' && String(user._id) === String(tenantId) &&
    !user.archive && !user.impersonation?.active)

export const resolveTenantAiSettings = (tenantId, siteSettings, owner, actor) => {
  const custom = siteSettings?.custom ?? {}
  const aitunnelKey = readString(custom, 'aitunnelKey')
  const deepseekKey = readString(custom, 'deepseekKey')
  const isDeveloper = owner?.role === 'dev'
  const canUseLocalAi = isDeveloper && !owner.archive && (actor === undefined || (
    actor && (Object.hasOwn(actor, 'user')
      ? isLocalAiDeveloper(actor.user, tenantId)
      : actor.userId != null && String(actor.userId) === String(tenantId))
  ))
  const savedAnalysisProvider = readString(custom, 'aiAnalysisProvider').toLowerCase()
  const allowedAnalysisProviders = isDeveloper
    ? ['artistcrm', 'aitunnel', 'deepseek']
    : ['artistcrm', 'aitunnel']
  const cloudAnalysisProvider = allowedAnalysisProviders.includes(savedAnalysisProvider)
    ? savedAnalysisProvider
    : aitunnelKey ? 'aitunnel' : 'artistcrm'
  const savedTranscriptionProvider = readString(custom, 'aiTranscriptionProvider')
  const cloudTranscriptionProvider = cloudAnalysisProvider === 'artistcrm'
    ? 'artistcrm'
    : (savedTranscriptionProvider.toLowerCase() === 'local' ? '' : savedTranscriptionProvider) ||
      (aitunnelKey ? 'aitunnel' : '')
  const localAnalysisSelected = canUseLocalAi && (
    getCustomValue(custom, 'localAiAnalysisSelected') === true || savedAnalysisProvider === 'local'
  )
  const localTranscriptionSelected = canUseLocalAi && (
    getCustomValue(custom, 'localAiTranscriptionSelected') === true ||
    savedTranscriptionProvider.toLowerCase() === 'local'
  )
  const localAiFu02Selected = canUseLocalAi && getCustomValue(custom, 'localAiFu02Selected') === true
  const aiAnalysisProvider = localAiFu02Selected ? 'artistcrm'
    : localAnalysisSelected ? 'local' : cloudAnalysisProvider
  const savedEnabled = getCustomValue(custom, 'aiIntegrationEnabled')
  return {
    tenantId: String(tenantId),
    userId: String(owner?._id || tenantId),
    isDeveloper,
    aitunnelKey,
    deepseekKey: isDeveloper ? deepseekKey : '',
    aiIntegrationEnabled: typeof savedEnabled === 'boolean' ? savedEnabled : true,
    aiAnalysisProvider,
    aiAnalysisModel: localAiFu02Selected || cloudAnalysisProvider === 'artistcrm'
      ? String(process.env.AITUNNEL_CALL_ANALYSIS_MODEL || 'gpt-4o-mini').trim()
      : readString(custom, 'aiAnalysisModel'),
    aiTranscriptionProvider: localTranscriptionSelected ? 'local' : cloudTranscriptionProvider,
    aiTranscriptionModel: cloudAnalysisProvider === 'artistcrm'
      ? String(process.env.AITUNNEL_TRANSCRIPTION_MODEL || 'whisper-1').trim()
      : readString(custom, 'aiTranscriptionModel'),
    ...(canUseLocalAi ? {
      aiAnalysisFallbackProvider: cloudAnalysisProvider,
      aiTranscriptionFallbackProvider: cloudTranscriptionProvider,
      localAiFu02Selected,
      aitunnelEnabled: getCustomValue(custom, 'aitunnelEnabled') === true,
      localAiEnabled: getCustomValue(custom, 'localAiEnabled') === true,
      localAiBaseUrl: readString(custom, 'localAiBaseUrl'),
      localAiModel: readString(custom, 'localAiModel'),
      localAiTranscriptionUrl: readString(custom, 'localAiTranscriptionUrl'),
      localAiVoiceCardUrl: readString(custom, 'localAiVoiceCardUrl'),
      localAiTimeoutMs: getCustomValue(custom, 'localAiTimeoutMs') ?? null,
      localAiKey: readString(custom, 'localAiKey'),
    } : {}),
    eventTypes: normalizeStringList(getCustomValue(custom, 'eventTypes')),
  }
}

export const getTenantAiSettings = async (tenantId, actor) => {
  if (!tenantId) return {}
  const [siteSettings, owner] = await Promise.all([
    SiteSettings.findOne({ tenantId }).select('custom').lean(),
    Users.findById(tenantId).select('_id role archive').lean(),
  ])
  return resolveTenantAiSettings(tenantId, siteSettings, owner, actor)
}
