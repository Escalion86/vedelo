import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { changeOrSetPassword, getPasswordStatus, PASSWORD_ERROR_MESSAGES } from '@server/passwordChange'
import { createMobileSession, revokeAllMobileSessions } from '@server/mobile/sessions'
import { getMobileDevice, mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import { NextResponse } from 'next/server'

const failure = (reason) => mobileError(reason, PASSWORD_ERROR_MESSAGES[reason],
  reason === 'USER_NOT_FOUND' ? 404 : reason.startsWith('PASSWORD_') ? 409 : 400,
  reason.startsWith('CURRENT_') ? 'currentPassword' : reason.includes('NEW_PASSWORD') ? 'newPassword' : undefined)
export const GET = async (req) => {
  const { user, tenantId } = await getRequestContext(req)
  if (!user?._id || !tenantId) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  const result = await getPasswordStatus({ userId: user._id, tenantId })
  if (!result.ok) return failure(result.reason)
  return NextResponse.json({ success: true, data: { hasPassword: result.hasPassword } }, { headers: { 'Cache-Control': 'no-store' } })
}
export const POST = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  const body = await req.json().catch(() => ({}))
  await dbConnect()
  const result = await changeOrSetPassword({ userId: context.user._id, tenantId: context.tenantId, currentPassword: body?.currentPassword, newPassword: body?.newPassword })
  if (!result.ok) return failure(result.reason)
  const user = await Users.findOne({ _id: context.user._id, tenantId: context.tenantId, archive: { $ne: true } })
  if (!user) return failure('USER_NOT_FOUND')
  await revokeAllMobileSessions(user._id)
  const session = await createMobileSession({ user, device: getMobileDevice(req, body || {}) })
  return mobileSuccess(session)
}
