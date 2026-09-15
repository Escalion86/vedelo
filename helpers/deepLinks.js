/**
 * Deep Link URL Parser & Builder
 *
 * Schema: {scheme}://{host}/{version}/{resource}?{params}
 *   scheme: vedelo (mobile; artistcrm remains supported) | https (web)
 *   host: app (mobile) | vedelo.ru (web)
 *   version: v1
 *   resource: request | event
 *
 * Common params: org_id (required)
 * Request params: request_id (required), tab, action
 * Event params: event_id (required), tab, date
 */

// --- Constants ---

export const DEEP_LINK_VERSION = 'v1'

export const DEEP_LINK_RESOURCES = Object.freeze({
  REQUEST: 'request',
  EVENT: 'event',
})

export const DEEP_LINK_VALID_TABS = Object.freeze({
  request: ['details', 'chat', 'history'],
  event: ['details', 'lineup', 'guests'],
})

export const DEEP_LINK_VALID_ACTIONS = Object.freeze({
  request: ['accept', 'decline', 'assign'],
  event: [],
})

// --- Validation ---

const MONGODB_OID_RE = /^[0-9a-fA-F]{24}$/

export const isValidId = (value) => {
  if (!value || typeof value !== 'string') return false
  return MONGODB_OID_RE.test(value.trim())
}

export const isValidTab = (resource, tab) => {
  if (!tab) return true // optional
  const allowed = DEEP_LINK_VALID_TABS[resource]
  if (!allowed) return false
  return allowed.includes(tab)
}

export const isValidAction = (resource, action) => {
  if (!action) return true // optional
  const allowed = DEEP_LINK_VALID_ACTIONS[resource]
  if (!allowed) return false
  return allowed.includes(action)
}

export const isValidDateParam = (value) => {
  if (!value) return true // optional
  if (typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(value)
  return !Number.isNaN(d.getTime())
}

// --- Parsing ---

/**
 * Parse a deep link URL into a structured object.
 * Supports both web URLs (https://vedelo.ru/v1/...)
 * and custom scheme URLs (vedelo://app/v1/... or legacy artistcrm://app/v1/...).
 *
 * Returns: { version, resource, orgId, id, tab, action, date, error }
 *   id = request_id or event_id (normalized)
 *   error = null | string (human-readable error)
 */
export const parseDeepLinkUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return { error: 'Empty URL', version: null, resource: null, orgId: null, id: null, tab: null, action: null, date: null }
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return { error: 'Invalid URL format', version: null, resource: null, orgId: null, id: null, tab: null, action: null, date: null }
  }

  // Validate scheme
  const scheme = parsed.protocol.replace(':', '')
  if (!['https', 'vedelo', 'artistcrm', 'http'].includes(scheme)) {
    return { error: `Unsupported scheme: ${scheme}`, version: null, resource: null, orgId: null, id: null, tab: null, action: null, date: null }
  }

  // Extract path segments: /v1/resource
  const pathParts = parsed.pathname.split('/').filter(Boolean)
  if (pathParts.length < 2) {
    return { error: 'URL path too short, expected /v1/{resource}', version: null, resource: null, orgId: null, id: null, tab: null, action: null, date: null }
  }

  const [version, resource] = pathParts
  if (version !== DEEP_LINK_VERSION) {
    return { error: `Unsupported version: ${version}`, version, resource: null, orgId: null, id: null, tab: null, action: null, date: null }
  }

  if (![DEEP_LINK_RESOURCES.REQUEST, DEEP_LINK_RESOURCES.EVENT].includes(resource)) {
    return { error: `Unknown resource: ${resource}`, version, resource, orgId: null, id: null, tab: null, action: null, date: null }
  }

  const orgId = parsed.searchParams.get('org_id') || null
  if (!orgId) {
    return { error: 'Missing org_id', version, resource, orgId: null, id: null, tab: null, action: null, date: null }
  }

  const idParam = resource === DEEP_LINK_RESOURCES.REQUEST
    ? parsed.searchParams.get('request_id')
    : parsed.searchParams.get('event_id')

  if (!idParam) {
    return { error: `Missing ${resource === DEEP_LINK_RESOURCES.REQUEST ? 'request_id' : 'event_id'}`, version, resource, orgId, id: null, tab: null, action: null, date: null }
  }

  if (!isValidId(idParam)) {
    return { error: `Invalid ID format: ${idParam}`, version, resource, orgId, id: idParam, tab: null, action: null, date: null }
  }

  const tab = parsed.searchParams.get('tab') || null
  if (tab && !isValidTab(resource, tab)) {
    return { error: `Invalid tab "${tab}" for ${resource}`, version, resource, orgId, id: idParam, tab, action: null, date: null }
  }

  const action = parsed.searchParams.get('action') || null
  if (action && !isValidAction(resource, action)) {
    return { error: `Invalid action "${action}" for ${resource}`, version, resource, orgId, id: idParam, tab, action, date: null }
  }

  const date = parsed.searchParams.get('date') || null
  if (date && !isValidDateParam(date)) {
    return { error: `Invalid date format: ${date}`, version, resource, orgId, id: idParam, tab, action, date }
  }

  return {
    error: null,
    version,
    resource,
    orgId,
    id: idParam.trim(),
    tab,
    action,
    date,
  }
}

// --- Web URL conversion ---

/**
 * Convert a parsed deep link into a web URL path for Next.js navigation.
 * Returns: { path, searchParams }
 *   path: /cabinet/eventsUpcoming or /cabinet/eventsPast
 *   searchParams: URLSearchParams with openEvent, tab, action, date
 */
export const deepLinkToWebUrl = (parsed) => {
  if (!parsed || parsed.error || !parsed.id) {
    return null
  }

  const isEvent = parsed.resource === DEEP_LINK_RESOURCES.EVENT
  const sp = new URLSearchParams()

  if (isEvent) {
    sp.set('openEvent', parsed.id)
    if (parsed.tab) sp.set('openTab', parsed.tab)
    if (parsed.date) sp.set('openDate', parsed.date)
  } else {
    // Requests are stored as events with status=draft in this system
    sp.set('openEvent', parsed.id)
    if (parsed.tab) sp.set('openTab', parsed.tab)
    if (parsed.action) sp.set('openAction', parsed.action)
  }

  return {
    searchParams: sp,
  }
}

// --- Push notification URL parsing ---

/**
 * Parse a push notification data.url into deep link params.
 * Handles both:
 *   - Legacy format: /cabinet/eventsUpcoming?openEvent=xxx
 *   - New format: /v1/event?event_id=xxx&org_id=yyy
 */
export const parsePushNotificationUrl = (url) => {
  if (!url || typeof url !== 'string') return null

  // Check if it's a deep link format
  if (url.includes('/v1/')) {
    return parseDeepLinkUrl(url)
  }

  // Legacy format: extract openEvent param
  try {
    const parsed = new URL(url, 'https://vedelo.ru')
    const openEvent = parsed.searchParams.get('openEvent')
    if (openEvent && isValidId(openEvent)) {
      return {
        error: null,
        version: null,
        resource: 'event', // assumed
        orgId: null,
        id: openEvent.trim(),
        tab: parsed.searchParams.get('openTab') || null,
        action: parsed.searchParams.get('openAction') || null,
        date: parsed.searchParams.get('openDate') || null,
      }
    }
  } catch {
    // fall through
  }

  return null
}
