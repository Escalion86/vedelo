const DEFAULT_YANDEX_METRIKA_ID = 112668604

const configuredMetrikaId = Number.parseInt(
  process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID || '',
  10
)

export const YANDEX_METRIKA_ID = Number.isSafeInteger(configuredMetrikaId)
  ? configuredMetrikaId
  : DEFAULT_YANDEX_METRIKA_ID

export const METRIKA_QUEUE_KEY = '__vedeloMetrikaGoalQueue'
export const LEGACY_METRIKA_QUEUE_KEY = '__artistcrmMetrikaGoalQueue'

const PUBLIC_ANALYTICS_PREFIXES = ['/crm-', '/kak-']

export const isPublicAnalyticsPath = (pathname = '') => {
  const normalizedPath = String(pathname).split(/[?#]/, 1)[0] || '/'
  return (
    normalizedPath === '/' ||
    normalizedPath === '/login' ||
    PUBLIC_ANALYTICS_PREFIXES.some((prefix) =>
      normalizedPath.startsWith(prefix)
    )
  )
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
