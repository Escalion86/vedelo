import SiteSettings from '@models/SiteSettings'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'

const CACHE_TTL_MS = 60_000
const cache = new Map()

export const getTenantWorkItemTerminology = async (tenantId) => {
  const key = String(tenantId || '')
  if (!key) return resolveWorkItemTerminology()

  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const siteSettings = await SiteSettings.findOne({ tenantId })
    .select('custom.primaryEntityTerminology custom.onboardingActivityPreset')
    .lean()
  const value = resolveWorkItemTerminology(siteSettings || {})
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}

export const clearTenantWorkItemTerminologyCache = (tenantId) => {
  if (tenantId) cache.delete(String(tenantId))
  else cache.clear()
}
