import { resolveClientTypes } from '../../helpers/clientTypes.mjs'

const sanitizeMobileSettings = (settings) => {
  if (!settings) return null
  const custom = settings.custom || {}
  return {
    _id: String(settings._id),
    syncVersion: settings.syncVersion || 1,
    clientTypes: resolveClientTypes(settings),
    clientTypesVersion: settings.clientTypesVersion || 0,
    towns: settings.towns || [],
    addresses: settings.addresses || [],
    defaultTown: settings.defaultTown || '',
    timeZone: settings.timeZone || 'Asia/Krasnoyarsk',
    eventsTags: settings.eventsTags || [],
    custom: {
      firstRunWizardCompleted: custom.firstRunWizardCompleted === true,
      firstRunWizardCompletedAt: custom.firstRunWizardCompletedAt || null,
      onboardingActivityPreset: custom.onboardingActivityPreset || '',
      primaryEntityTerminology:
        custom.primaryEntityTerminology === 'events' ||
        custom.primaryEntityTerminology === 'orders'
          ? custom.primaryEntityTerminology
          : 'auto',
      onboardingStarterServicesCreated:
        custom.onboardingStarterServicesCreated === true,
      showColleagueTransferFields: custom.showColleagueTransferFields === true,
      eventFormVariant: custom.eventFormVariant === 'classic' ? 'classic' : 'compact',
      defaultEventDurationMinutes: Number.isFinite(Number(custom.defaultEventDurationMinutes)) && Number(custom.defaultEventDurationMinutes) > 0 ? Number(custom.defaultEventDurationMinutes) : 60,
      cancelReasons: Array.isArray(custom.cancelReasons)
        ? custom.cancelReasons.filter((item) => typeof item === 'string')
        : [],
      mobileTheme: custom.mobileTheme === 'dark' ? 'dark' : 'light',
      eventTypes: Array.isArray(custom.eventTypes)
        ? custom.eventTypes.filter((item) => typeof item === 'string')
        : [],
    },
    updatedAt: settings.updatedAt,
  }
}

export { sanitizeMobileSettings }

export function normalizeWorkspaceSettings(body) {
  const invalid = () => { throw Error('INVALID_SETTINGS') }
  if (!body || Array.isArray(body) || !Number.isInteger(body.syncVersion) || body.syncVersion < 1) invalid()
  const update = {}
  for (const [key, value] of Object.entries(body)) {
    if (key === 'syncVersion') continue
    if (key === 'timeZone' && typeof value === 'string' && value.length <= 80) {
      new Intl.DateTimeFormat('ru-RU', { timeZone: value })
      update.timeZone = value
    } else if (key === 'defaultEventDurationMinutes' && Number.isInteger(value) && value >= 15 && value <= 1440) update[`custom.${key}`] = value
    else if (key === 'eventFormVariant' && ['compact', 'classic'].includes(value)) update[`custom.${key}`] = value
    else if (key === 'showColleagueTransferFields' && typeof value === 'boolean') update[`custom.${key}`] = value
    else invalid()
  }
  if (!Object.keys(update).length) invalid()
  return update
}
