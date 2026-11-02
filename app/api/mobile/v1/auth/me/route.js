import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { normalizeMobileProfilePatch } from '@server/mobile/profile'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import { serializeMobileUserWithTariff } from '@server/mobile/tariff'

export const GET = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  const user = await Users.findOne({
    _id: context.user._id,
    // Legacy owner accounts predate tenantId; they can only read their own ID.
    tenantId: String(context.tenantId) === String(context.user._id) ? { $in: [context.tenantId, null] } : context.tenantId,
    archive: { $ne: true },
  })
  if (!user) return mobileError('USER_NOT_FOUND', 'Пользователь не найден', 404)
  return mobileSuccess(await serializeMobileUserWithTariff(user))
}

export const PATCH = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  const body = await req.json().catch(() => ({}))
  const { update, error } = normalizeMobileProfilePatch(body)
  if (error) return mobileError('PROFILE_INVALID', error, 400)
  if (Object.keys(update).length === 0) {
    return mobileError('PROFILE_FIELDS_REQUIRED', 'Не переданы поля профиля', 400)
  }
  await dbConnect()
  const user = await Users.findOneAndUpdate(
    { _id: context.user._id, tenantId: context.tenantId },
    { $set: update },
    { returnDocument: 'after', runValidators: true }
  )
  if (!user) return mobileError('USER_NOT_FOUND', 'Пользователь не найден', 404)
  return mobileSuccess(await serializeMobileUserWithTariff(user))
}
