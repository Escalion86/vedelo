export const serializeMobileGoogleCalendar = (settings = {}, access = {}) => {
  return {
    available: Boolean(access?.allowCalendarSync),
    connected: Boolean(settings.refreshToken),
    enabled: settings.enabled,
    calendarId: settings.calendarId,
    calendarName: settings.calendarName,
    connectedAt: settings.connectedAt,
    reminders: settings.reminders,
    statusColors: settings.statusColors,
    syncSettings: settings.syncSettings,
    deleteCanceledFromCalendar: settings.deleteCanceledFromCalendar,
    skipTransferredFromCalendar: settings.skipTransferredFromCalendar,
  }
}

export const clearGoogleCalendarCredentials = (user) => {
  const settings = user?.googleCalendar || {}
  user.googleCalendar = {
    ...settings,
    enabled: false,
    calendarId: '',
    calendarName: '',
    refreshToken: '',
    accessToken: '',
    tokenExpiry: null,
    scope: '',
    syncToken: '',
    connectedAt: null,
    email: '',
  }
  return user
}

export const normalizeMobileGoogleCalendarPatch = (body) => {
  const object = value => value && typeof value === 'object' && !Array.isArray(value)
  const invalid = () => { throw new Error('Некорректные настройки Google Calendar') }
  if (!object(body)) invalid()
  const flags = ['enabled', 'deleteCanceledFromCalendar', 'skipTransferredFromCalendar']
  const syncFlags = ['showDescription', 'showClient', 'showOtherContacts', 'showColleague', 'showContractSum', 'showFinanceComment', 'showTransactions', 'showAdditionalEvents', 'showNavigationLinks', 'showEventLink', 'showStatusIcons']
  const titles = ['eventType_services', 'services_eventType', 'eventType', 'services', 'eventTitle', 'client_eventType']
  const update = {}
  for (const [key, value] of Object.entries(body)) {
    if (flags.includes(key)) {
      if (typeof value !== 'boolean') invalid()
      update[`googleCalendar.${key}`] = value
    } else if (key === 'statusColors') {
      if (!object(value)) invalid()
      for (const [status, color] of Object.entries(value)) {
        if (!['draft', 'active', 'canceled', 'closed'].includes(status) || typeof color !== 'string' || !/^(?:[1-9]|1[01])$/.test(color)) invalid()
        update[`googleCalendar.statusColors.${status}`] = color
      }
    } else if (key === 'syncSettings') {
      if (!object(value)) invalid()
      for (const [field, setting] of Object.entries(value)) {
        if (field === 'titleMode' ? !titles.includes(setting) : !syncFlags.includes(field) || typeof setting !== 'boolean') invalid()
        update[`googleCalendar.syncSettings.${field}`] = setting
      }
    } else if (key === 'reminders') {
      if (!object(value) || typeof value.useDefault !== 'boolean' || !Array.isArray(value.overrides) || value.overrides.length > 5 || Object.keys(value).some(field => !['useDefault', 'overrides'].includes(field))) invalid()
      const overrides = value.overrides.map(item => {
        if (!object(item) || !['popup', 'email'].includes(item.method) || !Number.isInteger(item.minutes) || item.minutes <= 0 || item.minutes > 40320 || Object.keys(item).some(field => !['method', 'minutes'].includes(field))) invalid()
        return { method: item.method, minutes: item.minutes }
      })
      if (!value.useDefault && !overrides.length) invalid()
      update['googleCalendar.reminders'] = { useDefault: value.useDefault, overrides: value.useDefault ? [] : overrides }
    } else invalid()
  }
  if (!Object.keys(update).length) invalid()
  return update
}
