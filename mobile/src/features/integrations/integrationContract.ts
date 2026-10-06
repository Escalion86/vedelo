// Only safe fields are projected into component state. Raw responses and secrets
// must never enter the query cache, offline storage or diagnostic messages.
export type ManagedProvider = 'telephony' | 'ai' | 'public-leads'
export type Provider = ManagedProvider | 'avito' | 'vk' | 'google-calendar'
export type ApiKeyMetadata = { id: string; name: string; enabled: boolean; lastFour: string }
export type ProviderStatus = {
  available: boolean; enabled: boolean; configured: boolean; status: string
  clientId?: string; accountId?: string; hasApiKey?: boolean
  analysisProvider?: string; transcriptionProvider?: string; platformConfigured?: boolean
  hasTranscriptionKey?: boolean; transcriptionModel?: string; analysisModel?: string
  endpoint?: string; keys?: ApiKeyMetadata[]; botUsername?: string
}
export type Reminder = { method: 'popup' | 'email'; minutes: number }
export type GoogleStatus = {
  available: boolean; connected: boolean; enabled: boolean; calendarId: string; calendarName: string
  reminders: { useDefault: boolean; overrides: Reminder[] }
  deleteCanceledFromCalendar: boolean; skipTransferredFromCalendar: boolean
}
export type CalendarItem = { id: string; summary: string; primary: boolean; accessRole: string }
export type IntegrationOverview = Partial<Record<Provider | 'telegram', ProviderStatus | GoogleStatus>>
export const titles = { 'google-calendar': 'Google Calendar', avito: 'Avito', vk: 'VK', telephony: 'Novofon', ai: 'ИИ-провайдер', 'public-leads': 'Входящие заявки API', telegram: 'Telegram Business' }
export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max = 300) => typeof v === 'string' && v.length <= max ? v : undefined
const bool = (v: unknown): v is boolean => typeof v === 'boolean'
export const responseData = (response: unknown): Record<string, unknown> => {
  if (!isObject(response) || response.success !== true || !isObject(response.data)) throw new Error('INVALID_RESPONSE')
  return response.data
}
export const readProvider = (provider: Exclude<Provider, 'google-calendar'> | 'telegram', data: unknown): ProviderStatus => {
  if (!isObject(data) || !bool(data.available) || !bool(data.enabled) || !bool(data.configured)) throw new Error('INVALID_STATUS')
  if (data.provider !== undefined && data.provider !== provider) throw new Error('WRONG_PROVIDER')
  const state: ProviderStatus = { available: data.available, enabled: data.enabled, configured: data.configured, status: text(data.status, 60) || '' }
  if (provider === 'avito' || provider === 'vk') {
    state.accountId = text(data.accountId)
    if (provider === 'avito') state.clientId = text(data.clientId)
  }
  if (provider === 'telephony') {
    if (!bool(data.hasApiKey)) throw new Error('INVALID_STATUS')
    state.hasApiKey = data.hasApiKey
  }
  if (provider === 'ai') {
    // Unknown legacy providers remain unsupported, never become artistcrm silently.
    state.analysisProvider = text(data.analysisProvider, 40)
    state.transcriptionProvider = text(data.transcriptionProvider, 40)
    state.platformConfigured = bool(data.platformConfigured) ? data.platformConfigured : undefined
    state.hasTranscriptionKey = bool(data.hasTranscriptionKey) ? data.hasTranscriptionKey : undefined
    state.transcriptionModel = text(data.transcriptionModel, 120)
    state.analysisModel = text(data.analysisModel, 120)
  }
  if (provider === 'public-leads') {
    if (!Array.isArray(data.keys)) throw new Error('INVALID_KEYS')
    state.keys = data.keys.map((key) => {
      if (!isObject(key) || !validIdentifier(key.id, 80) || !text(key.name, 120) || !bool(key.enabled) || !text(key.lastFour, 4) || String(key.lastFour).length !== 4) throw new Error('INVALID_KEY')
      return { id: String(key.id), name: String(key.name), enabled: key.enabled, lastFour: String(key.lastFour) }
    })
    if (new Set(state.keys.map((key) => key.id)).size !== state.keys.length) throw new Error('DUPLICATE_KEYS')
    state.endpoint = validHttpsUrl(data.endpoint) ? String(data.endpoint) : undefined
  }
  if (provider === 'telegram') state.botUsername = text(data.botUsername, 100)
  return state
}
export const readGoogle = (data: unknown): GoogleStatus => {
  if (!isObject(data) || !bool(data.available) || !bool(data.connected) || !bool(data.enabled) || text(data.calendarId, 500) === undefined || text(data.calendarName, 1000) === undefined || !bool(data.deleteCanceledFromCalendar) || !bool(data.skipTransferredFromCalendar) || !isObject(data.reminders) || !bool(data.reminders.useDefault) || !Array.isArray(data.reminders.overrides)) throw new Error('INVALID_GOOGLE')
  const overrides = data.reminders.overrides.map((item) => {
    if (!isObject(item) || (item.method !== 'popup' && item.method !== 'email') || typeof item.minutes !== 'number' || !Number.isFinite(item.minutes) || item.minutes <= 0) throw new Error('INVALID_REMINDER')
    return { method: item.method, minutes: item.minutes } as Reminder
  })
  if (!data.reminders.useDefault && !overrides.length) throw new Error('INVALID_REMINDERS')
  return { available: data.available, connected: data.connected, enabled: data.enabled, calendarId: String(data.calendarId), calendarName: String(data.calendarName), deleteCanceledFromCalendar: data.deleteCanceledFromCalendar, skipTransferredFromCalendar: data.skipTransferredFromCalendar, reminders: { useDefault: data.reminders.useDefault, overrides } }
}
export const readStatus = <T extends Provider>(provider: T, response: unknown): T extends 'google-calendar' ? GoogleStatus : ProviderStatus => {
  const data = responseData(response)
  return (provider === 'google-calendar' ? readGoogle(data) : readProvider(provider, data)) as T extends 'google-calendar' ? GoogleStatus : ProviderStatus
}
export const readOverview = (response: unknown): IntegrationOverview => {
  const data = responseData(response)
  const result: IntegrationOverview = {}
  for (const [provider, key] of [['google-calendar', 'googleCalendar'], ['avito', 'avito'], ['vk', 'vk'], ['telephony', 'telephony'], ['public-leads', 'publicLeadApi'], ['telegram', 'telegram']] as const) {
    try { result[provider] = provider === 'google-calendar' ? readGoogle(data[key]) : readProvider(provider, data[key]) } catch { /* Individual invalid statuses are unknown, not disconnected. */ }
  }
  // Deliberately ignore overview.ai: it reads legacy aitunnelEnabled.
  return result
}
export const readCalendars = (response: unknown): CalendarItem[] => {
  const data = responseData(response)
  if (!Array.isArray(data.calendars) || typeof data.selectedId !== 'string') throw new Error('INVALID_CALENDARS')
  const items = data.calendars.map((item) => {
    if (!isObject(item) || !validIdentifier(item.id, 500) || (item.summary !== undefined && text(item.summary, 1000) === undefined) || (item.primary !== undefined && !bool(item.primary)) || (item.accessRole !== undefined && text(item.accessRole, 60) === undefined)) throw new Error('INVALID_CALENDAR')
    return { id: String(item.id), summary: String(item.summary || ''), primary: item.primary === true, accessRole: String(item.accessRole || '') }
  })
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error('DUPLICATE_CALENDARS')
  return items
}
// Preserve the original value, including leading zeroes; reject rather than trim,
// strip a URL prefix, truncate or remove characters from an identifier/token.
export const validIdentifier = (v: unknown, max = 500): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && v === v.trim() && !/[\s\u0000-\u001f\u007f]/u.test(v)
export const validText = (v: string, max: number) => v.length > 0 && v.length <= max && v === v.trim() && !/[\u0000-\u001f\u007f]/u.test(v)
export const validHttpsUrl = (v: unknown): v is string => {
  if (typeof v !== 'string') return false
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && !!u.host } catch { return false }
}
export const readOAuthUrl = (response: unknown): string => {
  const url = responseData(response).url
  if (!validHttpsUrl(url)) throw new Error('INVALID_AUTH_URL')
  const u = new URL(url)
  if (u.hostname !== 'accounts.google.com' || u.port || !['/o/oauth2/v2/auth', '/o/oauth2/auth'].includes(u.pathname) || u.hash || !u.searchParams.get('state') || u.searchParams.has('access_token') || u.searchParams.has('Authorization')) throw new Error('INVALID_AUTH_URL')
  return url
}
export const validOAuthCallback = (value: string, scheme: string) => {
  if (!['vedelo', 'vedelo-dev', 'artistcrm', 'artistcrm-dev'].includes(scheme)) return false
  try {
    const url = new URL(value)
    const keys = [...url.searchParams.keys()]
    return url.protocol === `${scheme}:` && url.hostname === 'more' && url.pathname === '/integrations' && !url.port && !url.username && !url.password && !url.hash && keys.length === 1 && keys[0] === 'gc_connected' && url.searchParams.get('gc_connected') === '1'
  } catch { return false }
}
export const statusPresentation = (state?: ProviderStatus | GoogleStatus) => {
  if (!state) return { label: 'Статус неизвестен', tone: 'neutral' as const }
  if (!state.available) return { label: 'Недоступно по тарифу', tone: 'neutral' as const }
  if ('connected' in state) return { label: !state.connected ? 'Не подключено' : state.enabled ? 'Подключено' : 'Приостановлено', tone: state.connected && state.enabled ? 'success' as const : 'warning' as const }
  if (state.status === 'auth_error') return { label: 'Ошибка подключения', tone: 'warning' as const }
  if (state.status === 'webhook_manual') return { label: 'Нужен webhook', tone: 'warning' as const }
  if ('analysisProvider' in state && state.analysisProvider !== 'artistcrm' && state.analysisProvider !== 'aitunnel') return { label: 'Провайдер не поддерживается', tone: 'warning' as const }
  if (state.status === 'bot_ready') return { label: 'Бот настроен', tone: 'warning' as const }
  return { label: state.configured ? state.enabled ? 'Подключено' : 'Приостановлено' : state.enabled ? 'Нужна настройка' : 'Не подключено', tone: state.enabled && state.configured ? 'success' as const : 'warning' as const }
}
export const accessError = (reason: unknown) => isObject(reason) && (reason.status === 403 || reason.status === 401)
export const safeError = (reason: unknown, fallback: string) => accessError(reason) ? 'Нет доступа или интеграция недоступна на текущем тарифе.' : fallback
export const unconfirmed = 'Результат не подтверждён. Повторите чтение состояния перед новым действием.'
