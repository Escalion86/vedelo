import Events from '@models/Events'
import Services from '@models/Services'
import SiteSettings from '@models/SiteSettings'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import {
  buildDemoEventPayload,
  getOnboardingPreset,
  getStarterServicesForPreset,
  ONBOARDING_ACTIVITY_PRESETS,
} from '@helpers/onboardingPresets.mjs'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import { sanitizeMobileUser } from '@server/mobile/sessions'
import { sanitizeMobileSettings } from '@server/mobile/settings'
import {
  ACTIVITY_PROFILE_VERSION,
  allowLegacyActivitySelection,
  canEditActivityProfile,
  getActivityProfile,
  getActivityProfileFields,
  hasConfirmedActivityProfile,
  normalizeActivityPreset,
  validateActivityProfile,
} from '@helpers/activityProfile.mjs'
import { clearTenantWorkItemTerminologyCache } from '@server/tenantTerminology'

const publicPresets = ONBOARDING_ACTIVITY_PRESETS.map((preset) => ({
  key: preset.key,
  title: preset.title,
  shortTitle: preset.shortTitle,
  description: preset.description,
  starterServices: preset.starterServices,
}))

export const GET = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId) {
    return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  }
  await dbConnect()
  const [settings, servicesCount] = await Promise.all([
    SiteSettings.findOne({ tenantId: context.tenantId }).lean(),
    Services.countDocuments({ tenantId: context.tenantId }),
  ])
  const canEdit = canEditActivityProfile(context)
  const activityProfile = getActivityProfile(settings, canEdit)
  return mobileSuccess({
    completed: !canEdit || activityProfile.completed,
    activityProfile,
    settings: sanitizeMobileSettings(settings),
    servicesCount,
    presets: publicPresets,
  })
}

export const POST = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId) {
    return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  }
  const body = await req.json().catch(() => ({}))
  const firstName = String(body?.profile?.firstName || '').trim()
  const secondName = String(body?.profile?.secondName || '').trim()
  if (!firstName || !secondName) {
    return mobileError(
      'PROFILE_REQUIRED',
      'Укажите имя и фамилию',
      400,
      !firstName ? 'firstName' : 'secondName'
    )
  }
  const profileVersion = body?.activityProfileVersion
  const canEdit = canEditActivityProfile(context)
  const presetKey = normalizeActivityPreset(body?.presetKey) || 'other'
  let activityFields = {}
  if (profileVersion !== undefined && profileVersion !== ACTIVITY_PROFILE_VERSION)
    return mobileError('ACTIVITY_VERSION_INVALID', 'Обновите приложение и повторите настройку', 400)
  if (profileVersion === ACTIVITY_PROFILE_VERSION && canEdit) {
    const validation = validateActivityProfile({
      preset: body.presetKey,
      otherDescription: body.otherDescription,
      terminology: body.terminology,
    })
    if (!validation.value) {
      const { code, message, field } = validation
      return mobileError(code, message, 400, field === 'preset' ? 'presetKey' : field)
    }
    activityFields = getActivityProfileFields(validation.value)
  }
  const town = String(body?.town || '').trim()
  const timeZone = String(body?.timeZone || 'Asia/Krasnoyarsk').trim()
  const now = new Date()

  await dbConnect()
  const user = await Users.findOneAndUpdate(
    { _id: context.user._id, tenantId: context.tenantId },
    {
      $set: {
        firstName,
        secondName,
        thirdName: String(body?.profile?.thirdName || '').trim(),
        whatsapp: body?.profile?.whatsapp || null,
        telegram: String(body?.profile?.telegram || '').trim(),
        vk: String(body?.profile?.vk || '').trim(),
        instagram: String(body?.profile?.instagram || '').trim(),
      },
    },
    { returnDocument: 'after', runValidators: true }
  )
  if (!user) return mobileError('USER_NOT_FOUND', 'Пользователь не найден', 404)

  let settings
  if (canEdit) {
    for (let attempt = 0; attempt < 3 && !settings; attempt++) {
      const existing = await SiteSettings.findOne({ tenantId: context.tenantId }).lean()
      const activity = profileVersion === undefined
        ? allowLegacyActivitySelection(existing, context) ? { onboardingActivityPreset: presetKey } : {}
        : !hasConfirmedActivityProfile(existing) && existing?.custom?.firstRunWizardCompleted !== true ? activityFields : {}
      const custom = {
        firstRunWizardCompleted: true,
        firstRunWizardCompletedAt: existing?.custom?.firstRunWizardCompletedAt || now.toISOString(),
        onboardingStarterServicesCreated: Boolean(body?.createStarterServices),
        onboardingStarterServicesManual: !body?.createStarterServices,
        showColleagueTransferFields: Boolean(body?.showColleagueTransferFields),
        timeZoneConfirmed: true,
        mobileTheme: body?.theme === 'dark' ? 'dark' : 'light',
        ...activity,
      }
      const fields = { defaultTown: town, timeZone, towns: town
        ? Array.from(new Set([...(existing?.towns || []), town]))
        : existing?.towns || [] }
      try {
        if (!existing) {
          settings = (await SiteSettings.create({ tenantId: context.tenantId, ...fields, custom })).toObject({ flattenMaps: true })
        } else {
          const customPatch = Object.fromEntries(Object.entries(custom).map(([key, value]) => [`custom.${key}`, value]))
          settings = await SiteSettings.findOneAndUpdate(
            { tenantId: context.tenantId, syncVersion: existing.syncVersion ?? null, updatedAt: existing.updatedAt ?? null },
            { $set: { ...fields, ...customPatch }, $inc: { syncVersion: 1 } },
            { returnDocument: 'after', runValidators: true }
          ).lean()
        }
      } catch (error) {
        if (error?.code !== 11000) throw error
      }
    }
    if (!settings) return mobileError('ACTIVITY_CONFLICT', 'Настройки изменились. Повторите сохранение', 409)
    clearTenantWorkItemTerminologyCache(context.tenantId)
  } else {
    settings = await SiteSettings.findOne({ tenantId: context.tenantId }).lean()
  }

  let createdServices = []
  if (canEdit && body?.createStarterServices) {
    const servicesCount = await Services.countDocuments({
      tenantId: context.tenantId,
    })
    if (servicesCount === 0) {
      createdServices = await Services.insertMany(
        getStarterServicesForPreset(presetKey).map((service) => ({
          ...service,
          tenantId: context.tenantId,
        }))
      )
    }
  }

  let demoEvent = null
  if (canEdit && body?.createDemoEvent) {
    const existingDemo = await Events.findOne({
      tenantId: context.tenantId,
      isDemo: true,
    })
    if (!existingDemo) {
      const preset = getOnboardingPreset(presetKey)
      demoEvent = await Events.create({
        ...buildDemoEventPayload(
          preset.key,
          createdServices.map((service) => service._id)
        ),
        tenantId: context.tenantId,
        isDemo: true,
      })
    }
  }

  return mobileSuccess({
    user: sanitizeMobileUser(user),
    settings: sanitizeMobileSettings(settings),
    activityProfile: getActivityProfile(settings, canEdit),
    services: createdServices,
    event: demoEvent,
  })
}
