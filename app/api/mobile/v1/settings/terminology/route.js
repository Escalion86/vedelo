import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import { sanitizeMobileSettings } from '@server/mobile/settings'
import { PRIMARY_ENTITY_TERMINOLOGY_VALUES } from '@helpers/workItemTerminology.mjs'
import { clearTenantWorkItemTerminologyCache } from '@server/tenantTerminology'

export const GET = async (req) => {
  const { tenantId } = await getRequestContext(req)
  if (!tenantId) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  const settings = await SiteSettings.findOne({ tenantId }).lean()
  return mobileSuccess(sanitizeMobileSettings(settings))
}

export const PUT = async (req) => {
  const { tenantId } = await getRequestContext(req)
  if (!tenantId) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  const body = await req.json().catch(() => ({}))
  const value = String(body?.primaryEntityTerminology || '')
  if (!PRIMARY_ENTITY_TERMINOLOGY_VALUES.includes(value)) {
    return mobileError('TERMINOLOGY_INVALID', 'Выберите термин: авто, мероприятия или заказы', 400)
  }

  await dbConnect()
  const settings = await SiteSettings.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        tenantId,
        'custom.primaryEntityTerminology': value,
      },
      $inc: { syncVersion: 1 },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean()
  clearTenantWorkItemTerminologyCache(tenantId)
  return mobileSuccess(sanitizeMobileSettings(settings))
}
