const defaults = {
  analysis: { url: 'LOCAL_AI_ANALYSIS_URL', model: 'LOCAL_AI_ANALYSIS_MODEL', timeout: 'LOCAL_AI_ANALYSIS_TIMEOUT_MS', defaultTimeout: 20000 },
  transcription: { url: 'LOCAL_AI_TRANSCRIPTION_URL', model: 'LOCAL_AI_TRANSCRIPTION_MODEL', timeout: 'LOCAL_AI_TRANSCRIPTION_TIMEOUT_MS', defaultTimeout: 30000 },
}

export function getLocalAiProvider(kind, env = process.env) {
  const config = defaults[kind]
  if (!config) return null
  const model = String(env[config.model] || '').trim()
  if (!env[config.url] || !model) return null
  try {
    const url = new URL(env[config.url])
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) return null
    const timeout = Number(env[config.timeout])
    return { name: 'local', kind, apiUrl: url.href, model, apiKey: String(env.LOCAL_AI_API_KEY || '').trim(),
      timeoutMs: Number.isInteger(timeout) && timeout >= 1000 && timeout <= 120000 ? timeout : config.defaultTimeout }
  } catch { return null }
}

const circuits = new Map()
const cooldownMs = 7 * 60_000

// One probe after cooldown. Older overlapping responses cannot reopen a circuit
// that has already moved on to a new generation.
export async function tryLocalAiProvider(provider, request, clock = Date.now) {
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
    }
    return null
  }
}
