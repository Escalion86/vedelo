const DEFAULT_YANDEX_METRIKA_ID = 112668604

const configuredMetrikaId = Number.parseInt(
  process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID || '',
  10
)

export const YANDEX_METRIKA_ID = Number.isSafeInteger(configuredMetrikaId)
  ? configuredMetrikaId
  : DEFAULT_YANDEX_METRIKA_ID

export const ANALYTICS_CONSENT_STORAGE_KEY = 'vedelo:analytics-consent:v1'
export const ANALYTICS_CONSENT_EVENT = 'vedelo:analytics-consent-changed'
export const METRIKA_QUEUE_KEY = '__vedeloMetrikaGoalQueue'
export const LEGACY_METRIKA_QUEUE_KEY = '__artistcrmMetrikaGoalQueue'

export const getAnalyticsConsent = () => {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

export const isAnalyticsHost = (hostname = '') => {
  const normalizedHost = String(hostname).trim().toLowerCase()
  return (
    normalizedHost === 'vedelo.ru' ||
    normalizedHost === 'www.vedelo.ru' ||
    normalizedHost === 'localhost' ||
    normalizedHost === '127.0.0.1'
  )
}
