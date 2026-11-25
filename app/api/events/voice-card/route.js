import { getTenantAiSettings } from '@server/aiSettings'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { getLocalAiDeveloperContext } from '@server/localAiAccess'
import { buildLocalAiUrl, isLocalAiEnabled, normalizeLocalAiTimeout } from '@server/localAiProvider.mjs'

const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const FIELD_NAMES = [
  'usluga', 'data', 'vremya', 'gorod', 'mesto', 'gostey', 'byudzhet',
  'telefon', 'imya', 'zhelaniya', 'confidence',
]

const fail = (error, status) => Response.json({ success: false, error }, { status })

export async function POST(request) {
  const { tenantId, user, status, error } = await getLocalAiDeveloperContext(request)
  if (!tenantId) return fail(error, status)

  const access = await getUserTariffAccess(user._id)
  if (!access?.allowAi) return fail('Голосовая карточка доступна только в тарифе с ИИ', 403)

  const settings = await getTenantAiSettings(tenantId, { user })
  if (!isLocalAiEnabled(settings)) return fail('Включите локальный ИИ в настройках интеграций', 403)

  const url = buildLocalAiUrl(
    settings.localAiVoiceCardUrl || process.env.LOCAL_AI_VOICE_CARD_URL || 'http://127.0.0.1:18012',
    '/voice-card'
  )
  if (!url) return fail('Неверный адрес сервиса голосовой карточки', 400)

  const input = await request.formData().catch(() => null)
  const audio = input?.get('audio')
  if (!(audio instanceof Blob) || !audio.size) return fail('Аудиофайл не передан', 400)
  if (audio.size > MAX_AUDIO_BYTES) return fail('Аудиофайл слишком большой', 413)

  const today = input.get('today')
  if (today !== null && (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today))) {
    return fail('Передайте дату в формате ГГГГ-ММ-ДД', 400)
  }

  const body = new FormData()
  body.set('audio', audio, audio.name || 'voice-card.webm')
  if (today !== null) body.set('today', today)

  try {
    const key = settings.localAiKey || process.env.LOCAL_AI_API_KEY
    const response = await fetch(url, {
      method: 'POST',
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(normalizeLocalAiTimeout(settings.localAiTimeoutMs) ?? 60000),
    })
    if (!response.ok) throw new Error('LOCAL_AI_VOICE_CARD_HTTP')

    const result = await response.json()
    if (!result || typeof result !== 'object' || !FIELD_NAMES.some((name) => Object.hasOwn(result, name))) {
      throw new Error('LOCAL_AI_VOICE_CARD_RESPONSE')
    }

    const fields = Object.fromEntries(FIELD_NAMES.map((name) => [name, result[name] ?? null]))
    return Response.json({ success: true, provider: 'local', fields })
  } catch (error) {
    const timeout = error?.name === 'TimeoutError'
    console.warn('[events/voice-card] local', { code: timeout ? 'TIMEOUT' : 'UNAVAILABLE' })
    return fail('Сервис голосовой карточки недоступен', timeout ? 504 : 502)
  }
}
