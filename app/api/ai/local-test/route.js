import SiteSettings from '@models/SiteSettings'
import { resolveTenantAiSettings } from '@server/aiSettings'
import { getLocalAiDeveloperContext } from '@server/localAiAccess'
import { buildLocalAiUrl } from '@server/localAiProvider.mjs'

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

export const POST = async (req) => {
  const access = await getLocalAiDeveloperContext(req)
  if (access.error) return json({ success: false, error: access.error }, access.status)

  const raw = await req.text()
  let body
  try {
    body = raw ? JSON.parse(raw) : {}
  } catch {
    return json({ success: false, error: 'Некорректный JSON запроса' }, 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ success: false, error: 'Передайте параметры подключения' }, 400)
  }
  if (
    (body.localAiBaseUrl != null && typeof body.localAiBaseUrl !== 'string') ||
    (body.localAiModel != null && typeof body.localAiModel !== 'string')
  ) {
    return json({ success: false, error: 'Адрес и название модели должны быть строками' }, 400)
  }
  const { tenantId, owner, user } = access
  const siteSettings = await SiteSettings.findOne({ tenantId }).select('custom').lean()
  const settings = resolveTenantAiSettings(tenantId, siteSettings, owner, { user })
  const baseUrl = body.localAiBaseUrl ?? settings.localAiBaseUrl
  const modelsUrl = buildLocalAiUrl(baseUrl || process.env.LOCAL_AI_ANALYSIS_URL, '/models')
  if (!modelsUrl) {
    return json({ success: false, error: 'Укажите HTTP/HTTPS-адрес локального сервиса на 127.0.0.1 или [::1] без логина и пароля' }, 400)
  }

  const configuredModel = body.localAiModel ?? settings.localAiModel
  const expectedModel = String(configuredModel || process.env.LOCAL_AI_ANALYSIS_MODEL || '').trim()
  const apiKey = settings.localAiKey || String(process.env.LOCAL_AI_API_KEY || '').trim()
  const startedAt = performance.now()
  try {
    const response = await fetch(modelsUrl, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
    })
    if (!response.ok) {
      const details = (await response.text()).trim().slice(0, 2000)
      throw new Error(details || `HTTP ${response.status}`)
    }
    const payload = await response.json()
    const models = Array.isArray(payload?.data)
      ? payload.data.map((value) => value?.id).filter((id) => typeof id === 'string' && id.trim())
      : []
    if (models.length === 0) throw new Error('Локальный сервис вернул пустой список моделей')
    return json({
      success: true,
      model: models.includes(expectedModel) ? expectedModel : models[0],
      latencyMs: Math.round(performance.now() - startedAt),
    })
  } catch (error) {
    const message = error?.message || String(error)
    return json({ success: false, error: apiKey ? message.replaceAll(apiKey, '[скрыто]') : message })
  }
}
