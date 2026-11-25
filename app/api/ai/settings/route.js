import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import {
  isLocalAiCustomKey,
  mergeSiteSettingsCustom,
  siteSettingsCustomPaths,
} from '@helpers/siteSettingsCustom.mjs'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { getProtectedCustomAccessFailures } from '@server/integrationAccess'
import {
  DEFAULT_AI_MARKUP_COEFFICIENT,
  normalizeAiMarkupCoefficient,
} from '@server/aiBilling'
import {
  getTenantAiSettings,
  isLocalAiDeveloper,
  resolveTenantAiSettings,
} from '@server/aiSettings'
import { getLocalAiDeveloperContext } from '@server/localAiAccess'
import { normalizeLocalAiTimeout, normalizeLocalAiUrl } from '@server/localAiProvider.mjs'

const serializeSettings = (settings) => ({
  markupCoefficient: normalizeAiMarkupCoefficient(
    settings?.aiBilling?.markupCoefficient
  ),
  platformConfigured: Boolean(String(process.env.AITUNNEL_KEY || '').trim()),
})

const requireDeveloper = async (req) => {
  const { user, tenantId } = await getRequestContext(req)
  if (!user) return { status: 401, error: 'Не авторизован' }
  if (user.role !== 'dev') return { status: 403, error: 'Нет доступа' }
  return { user, tenantId }
}

const serializeLocalSettings = (settings) => {
  if (!Object.hasOwn(settings, 'localAiEnabled')) return {}
  const {
    localAiEnabled,
    localAiBaseUrl,
    localAiModel,
    localAiTranscriptionUrl,
    localAiVoiceCardUrl,
    localAiTimeoutMs,
    aiAnalysisProvider,
    aiAnalysisModel,
    aiTranscriptionProvider,
    aiTranscriptionModel,
    aiIntegrationEnabled,
    aitunnelEnabled,
    aiAnalysisFallbackProvider,
    aiTranscriptionFallbackProvider,
  } = settings
  return {
    localAiEnabled,
    localAiBaseUrl,
    localAiModel,
    localAiTranscriptionUrl,
    localAiVoiceCardUrl,
    localAiTimeoutMs,
    aiAnalysisProvider,
    aiAnalysisModel,
    aiTranscriptionProvider,
    aiTranscriptionModel,
    aiIntegrationEnabled,
    aitunnelEnabled,
    aiAnalysisFallbackProvider,
    aiTranscriptionFallbackProvider,
  }
}

const privateHeaders = { 'Cache-Control': 'no-store' }

export const GET = async (req) => {
  const access = await requireDeveloper(req)
  if (access.error) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    )
  }

  await dbConnect()
  const { tenantId, user } = access
  const [settings, local] = await Promise.all([
    SiteSettings.findOne({ tenantId: null }).select('aiBilling').lean(),
    isLocalAiDeveloper(user, tenantId) ? getTenantAiSettings(tenantId, { user }) : {},
  ])

  return NextResponse.json({
    success: true,
    data: {
      ...(settings ? serializeSettings(settings) : {
          markupCoefficient: DEFAULT_AI_MARKUP_COEFFICIENT,
          platformConfigured: Boolean(
            String(process.env.AITUNNEL_KEY || '').trim()
          ),
      }),
      ...serializeLocalSettings(local),
    },
  }, { headers: privateHeaders })
}

const updateMarkup = async (body) => {
  const rawCoefficient = Number(body?.markupCoefficient)
  if (!Number.isFinite(rawCoefficient) || rawCoefficient < 1 || rawCoefficient > 10) {
    return NextResponse.json(
      { success: false, error: 'Коэффициент должен быть от 1 до 10' },
      { status: 400 }
    )
  }

  await dbConnect()
  const settings = await SiteSettings.findOneAndUpdate(
    { tenantId: null },
    {
      $set: {
        tenantId: null,
        'aiBilling.markupCoefficient': normalizeAiMarkupCoefficient(
          rawCoefficient
        ),
      },
    },
    { returnDocument: 'after', upsert: true }
  ).lean()

  return NextResponse.json({ success: true, data: serializeSettings(settings) })
}

export const POST = async (req) => {
  const access = await requireDeveloper(req)
  if (access.error) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    )
  }
  return updateMarkup(await req.json().catch(() => ({})))
}

const urlFields = new Set(['localAiBaseUrl', 'localAiTranscriptionUrl', 'localAiVoiceCardUrl'])
const switches = new Set(['localAiEnabled', 'aiIntegrationEnabled', 'aitunnelEnabled'])
const textFields = new Set(['localAiModel', 'localAiKey', 'aiAnalysisModel', 'aiTranscriptionModel'])
const cloudProviders = {
  aiAnalysisProvider: ['artistcrm', 'aitunnel', 'deepseek'],
  aiTranscriptionProvider: ['', 'artistcrm', 'aitunnel', 'openai'],
}
const localSelectionFields = {
  aiAnalysisProvider: 'localAiAnalysisSelected',
  aiTranscriptionProvider: 'localAiTranscriptionSelected',
}

const parseLocalSettings = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    return { error: 'Передайте настройки локального ИИ' }
  }
  const settings = {}
  for (const [key, value] of Object.entries(body)) {
    if (urlFields.has(key)) {
      const url = normalizeLocalAiUrl(value)
      if (!url && value !== '' && value !== null) {
        return { error: `Некорректный ${key}. Укажите HTTP/HTTPS-адрес 127.0.0.1 или [::1] без логина и пароля` }
      }
      settings[key] = url || ''
    } else if (switches.has(key) && typeof value === 'boolean') {
      settings[key] = value
    } else if (key === 'localAiTimeoutMs') {
      const timeout = normalizeLocalAiTimeout(value)
      if (timeout === undefined && value !== '' && value !== null) {
        return { error: 'Таймаут должен быть целым числом от 1000 до 120000 мс' }
      }
      settings[key] = timeout ?? null
    } else if (textFields.has(key) && (value === null || typeof value === 'string')) {
      settings[key] = value?.trim() || ''
    } else if (Object.hasOwn(cloudProviders, key)) {
      if (value !== 'local' && !cloudProviders[key].includes(value)) {
        return { error: 'Некорректный ИИ-провайдер' }
      }
      settings[localSelectionFields[key]] = value === 'local'
      if (value !== 'local') settings[key] = value
    } else {
      return { error: 'Некорректные параметры локального ИИ' }
    }
  }
  return { settings }
}

export const PATCH = async (req) => {
  const access = await getLocalAiDeveloperContext(req)
  if (access.error) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    )
  }

  const body = await req.json().catch(() => null)
  if (body && Object.keys(body).length === 1 && Object.hasOwn(body, 'markupCoefficient')) {
    return updateMarkup(body)
  }
  const { settings, error } = parseLocalSettings(body)
  if (error) return NextResponse.json({ success: false, error }, { status: 400 })

  const { tenantId, owner, user } = access
  const hasCloudChanges = Object.keys(settings).some((key) => !isLocalAiCustomKey(key))
  const existing = hasCloudChanges
    ? await SiteSettings.findOne({ tenantId }).select('custom updatedAt').lean()
    : null
  if (hasCloudChanges) {
    const failures = getProtectedCustomAccessFailures({
      existingCustom: existing?.custom,
      nextCustom: mergeSiteSettingsCustom(existing?.custom, settings),
      access: await getUserTariffAccess(tenantId),
    })
    if (failures.length > 0) {
      return NextResponse.json({ success: false, error: 'ИИ-возможности недоступны по тарифу' }, { status: 403 })
    }
  }
  let updated
  try {
    updated = await SiteSettings.findOneAndUpdate(
      { tenantId, ...(hasCloudChanges ? { updatedAt: existing?.updatedAt ?? null } : {}) },
      { $set: siteSettingsCustomPaths(settings) },
      { returnDocument: 'after', upsert: true }
    ).lean()
  } catch (updateError) {
    if (updateError.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Настройки изменились. Обновите данные и повторите сохранение.' },
        { status: 409 }
      )
    }
    throw updateError
  }
  return NextResponse.json(
    { success: true, data: serializeLocalSettings(resolveTenantAiSettings(tenantId, updated, owner, { user })) },
    { headers: privateHeaders }
  )
}
