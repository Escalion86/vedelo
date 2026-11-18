import SiteSettings from '@models/SiteSettings'
import {
  getActivityProfile,
  getActivityProfileFields,
  hasConfirmedActivityProfile,
} from '@helpers/activityProfile.mjs'
import { clearTenantWorkItemTerminologyCache } from '@server/tenantTerminology'

export const saveActivityProfile = async (tenantId, input) => {
  const fields = getActivityProfileFields(input)
  const patch = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [`custom.${key}`, value])
  )
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await SiteSettings.findOne({ tenantId }).lean()
    const profile = getActivityProfile(existing, true)
    if (
      hasConfirmedActivityProfile(existing) &&
      profile.preset === input.preset &&
      profile.otherDescription === input.otherDescription &&
      (input.terminology === undefined || profile.terminology === input.terminology)
    ) return profile

    let saved
    if (!existing) {
      try {
        saved = await SiteSettings.create({ tenantId, custom: fields })
      } catch (error) {
        if (error?.code !== 11000) throw error
        continue
      }
    } else {
      saved = await SiteSettings.findOneAndUpdate(
        { tenantId, syncVersion: existing.syncVersion ?? null, updatedAt: existing.updatedAt ?? null },
        { $set: patch, $inc: { syncVersion: 1 } },
        { returnDocument: 'after', runValidators: true }
      ).lean()
    }
    if (saved) {
      clearTenantWorkItemTerminologyCache(tenantId)
      return getActivityProfile(saved, true)
    }
  }
  return null
}
