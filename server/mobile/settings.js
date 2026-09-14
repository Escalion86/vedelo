const sanitizeMobileSettings = (settings) => {
  if (!settings) return null
  const custom = settings.custom || {}
  return {
    _id: String(settings._id),
    syncVersion: settings.syncVersion || 1,
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
      mobileTheme: custom.mobileTheme === 'dark' ? 'dark' : 'light',
      eventTypes: Array.isArray(custom.eventTypes)
        ? custom.eventTypes.filter((item) => typeof item === 'string')
        : [],
    },
    updatedAt: settings.updatedAt,
  }
}

export { sanitizeMobileSettings }
