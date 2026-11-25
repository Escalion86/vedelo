export const LOCAL_AI_ANALYSIS_PROVIDER = Object.freeze({
  urlEnv: 'LOCAL_AI_ANALYSIS_URL',
  modelEnv: 'LOCAL_AI_ANALYSIS_MODEL',
  timeoutEnv: 'LOCAL_AI_ANALYSIS_TIMEOUT_MS',
  defaultTimeout: 20000,
  settingsKey: 'localAiKey',
  apiKeyEnv: 'LOCAL_AI_API_KEY',
})

const defaults = {
  analysis: LOCAL_AI_ANALYSIS_PROVIDER,
  transcription: {
    urlEnv: 'LOCAL_AI_TRANSCRIPTION_URL',
    modelEnv: 'LOCAL_AI_TRANSCRIPTION_MODEL',
    timeoutEnv: 'LOCAL_AI_TRANSCRIPTION_TIMEOUT_MS',
    defaultModel: 'gigaam',
    defaultTimeout: 30000,
    settingsKey: 'localAiKey',
    apiKeyEnv: 'LOCAL_AI_API_KEY',
  },
}

export function normalizeLocalAiUrl(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) ||
      !['127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || /[?#]/.test(url.href)) return ''
    return url.href.replace(/\/+$/, '')
  } catch {
    return ''
  }
}

export function buildLocalAiUrl(baseUrl, suffix) {
  const url = normalizeLocalAiUrl(baseUrl)
  if (!url) return ''
  const base = suffix === '/models' ? url.replace(/\/chat\/completions$/, '') : url
  return base.endsWith(suffix) ? base : `${base}${suffix}`
}

export function normalizeLocalAiTimeout(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  const timeout = Number(value)
  return Number.isInteger(timeout) && timeout >= 1000 && timeout <= 120000
    ? timeout
    : undefined
}

export function getLocalAiProvider(kind, env = process.env, settings = {}) {
  const config = defaults[kind]
  if (!config) return null
  const analysis = kind === 'analysis'
  const baseUrl = normalizeLocalAiUrl(
    (analysis ? settings.localAiBaseUrl : settings.localAiTranscriptionUrl) || env[config.urlEnv]
  )
  const model = String((analysis && settings.localAiModel) || env[config.modelEnv] || config.defaultModel || '').trim()
  if (!baseUrl || !model) return null

  const suffix = analysis ? '/chat/completions' : '/audio/transcriptions'
  const base = !analysis && new URL(baseUrl).pathname === '/' ? `${baseUrl}/v1` : baseUrl
  return {
    name: 'local',
    kind,
    apiUrl: buildLocalAiUrl(base, suffix),
    model,
    apiKey: String(settings[config.settingsKey] || env[config.apiKeyEnv] || '').trim(),
    timeoutMs: normalizeLocalAiTimeout(settings.localAiTimeoutMs) ??
      normalizeLocalAiTimeout(env[config.timeoutEnv]) ?? config.defaultTimeout,
  }
}

export function isLocalAiEnabled(settings) {
  return settings.isDeveloper === true && settings.localAiEnabled === true && settings.aiIntegrationEnabled !== false
}

const circuits = new Map()
const cooldownMs = 7 * 60_000

// One probe after cooldown. Older overlapping responses cannot reopen a circuit
// that has already moved on to a new generation.
export async function tryLocalAiProvider(provider, request, clock = Date.now, onOpen) {
  if (!provider) return null
  const key = `${provider.kind}:${provider.apiUrl}`
  if (!circuits.has(key)) circuits.set(key, { failures: 0, until: 0, probing: false, generation: 0 })
  const circuit = circuits.get(key)
  if (circuit.until > clock() || circuit.probing) return null
  circuit.probing = circuit.until !== 0
  const generation = circuit.generation
  try {
    const result = await request(provider)
    if (!result) throw new Error('LOCAL_AI_EMPTY')
    if (circuit.generation === generation) Object.assign(circuit, { failures: 0, until: 0, probing: false })
    return result
  } catch {
    if (circuit.generation === generation && (++circuit.failures >= 3 || circuit.probing)) {
      Object.assign(circuit, { until: clock() + cooldownMs, probing: false, generation: generation + 1 })
      onOpen?.()
    }
    return null
  }
}
