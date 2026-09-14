const DEEP_LINK_VERSION = 'v1'
const MOBILE_SCHEME = 'vedelo'
const LEGACY_MOBILE_SCHEME = 'artistcrm'
const MOBILE_HOST = 'app'

const getWebHost = () => {
  const domain = String(process.env.DOMAIN || 'https://vedelo.ru').trim()
  return domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

/**
 * Build a deep link URL for opening a resource card.
 *
 * @param {Object} params
 * @param {'request' | 'event'} params.resource — Resource type
 * @param {string} params.resourceId — MongoDB ObjectId of the document
 * @param {string} params.orgId — Organization/tenant identifier (tenantId in DB)
 * @param {'mobile' | 'web'} [params.target='mobile'] — Target platform
 * @param {string} [params.tab] — Optional tab to open
 * @param {string} [params.action] — Optional pre-triggered action (request only)
 * @param {string} [params.date] — Optional ISO date YYYY-MM-DD (event only)
 * @returns {string} Deep link URL
 */
const buildDeepLink = ({
  resource,
  resourceId,
  orgId,
  target = 'mobile',
  tab,
  action,
  date,
}) => {
  if (!resource || !resourceId || !orgId) return ''

  const idParam = resource === 'request' ? 'request_id' : 'event_id'
  const params = new URLSearchParams({
    [idParam]: String(resourceId),
    org_id: String(orgId),
  })
  if (tab) params.set('tab', String(tab))
  if (resource === 'request' && action) params.set('action', String(action))
  if (resource === 'event' && date) params.set('date', String(date))

  const query = params.toString()

  if (target === 'mobile') {
    return `${MOBILE_SCHEME}://${MOBILE_HOST}/${DEEP_LINK_VERSION}/${resource}?${query}`
  }

  return `https://${getWebHost()}/${DEEP_LINK_VERSION}/${resource}?${query}`
}

/**
 * Build both mobile and web deep links for a resource.
 *
 * @param {Object} params — Same as buildDeepLink (without target)
 * @returns {{ mobile: string, web: string }}
 */
const buildDeepLinks = (params) => ({
  mobile: buildDeepLink({ ...params, target: 'mobile' }),
  web: buildDeepLink({ ...params, target: 'web' }),
})

export { buildDeepLink, buildDeepLinks, MOBILE_SCHEME, LEGACY_MOBILE_SCHEME }
