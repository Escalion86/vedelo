const toPlainCustom = (custom) => {
  if (!custom || typeof custom !== 'object') return {}
  if (typeof custom.get === 'function') return Object.fromEntries(custom)
  return custom
}

export const mergeSiteSettingsCustom = (existing, patch) => ({
  ...toPlainCustom(existing),
  ...toPlainCustom(patch),
})

export const siteSettingsCustomPaths = (patch) =>
  Object.fromEntries(Object.entries(patch).map(([key, value]) => [`custom.${key}`, value]))

const isProviderSelection = (key) =>
  key === 'aiAnalysisProvider' || key === 'aiTranscriptionProvider'

const isLocalProvider = (value) =>
  typeof value === 'string' && ['local', 'fu02'].includes(value.trim().toLowerCase())

export const isLocalAiCustomKey = (key) =>
  key.startsWith('localAi') ||
  key === 'aiAnalysisFallbackProvider' ||
  key === 'aiTranscriptionFallbackProvider'

export const hasLocalAiCustomPatch = (custom) =>
  Object.entries(toPlainCustom(custom)).some(([key, value]) =>
    isLocalAiCustomKey(key) || (isProviderSelection(key) && isLocalProvider(value))
  )

export const sanitizeLocalAiCustom = (custom) =>
  Object.fromEntries(Object.entries(toPlainCustom(custom)).filter(([key, value]) =>
    !isLocalAiCustomKey(key) && !(isProviderSelection(key) && isLocalProvider(value))
  ))

export const sanitizeLocalAiSiteSettings = (settings) => {
  if (!settings || !hasLocalAiCustomPatch(settings.custom)) return settings
  const source = typeof settings.toObject === 'function' ? settings.toObject() : settings
  return { ...source, custom: sanitizeLocalAiCustom(source.custom) }
}
