import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import { normalizeWorkspaceSettings, sanitizeMobileSettings } from '@server/mobile/settings'

export const GET = async (req) => {
  const { tenantId, user } = await getRequestContext(req)
  if (!tenantId || !user?._id) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  const settings = await SiteSettings.findOne({ tenantId }).lean()
  return mobileSuccess(sanitizeMobileSettings(settings))
}

export const PUT = async (req) => {
  const { tenantId, user } = await getRequestContext(req)
  if (!tenantId || !user?._id) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  const body = await req.json().catch(() => null)
  let update
  try { update = normalizeWorkspaceSettings(body) }
  catch { return mobileError('INVALID_SETTINGS', 'Проверьте настройки организации', 400) }
  await dbConnect()
  const version = body.syncVersion
  const versionFilter = version === 1 ? { $in: [1, null] } : version
  const settings = await SiteSettings.findOneAndUpdate(
    { tenantId, syncVersion: versionFilter },
    { $set: { ...update, syncVersion: version + 1 } },
    { returnDocument: 'after', runValidators: true }
  ).lean()
  if (!settings) return mobileError('SETTINGS_CHANGED', 'Настройки изменились. Загрузите актуальную версию.', 409)
  return mobileSuccess(sanitizeMobileSettings(settings))
}
