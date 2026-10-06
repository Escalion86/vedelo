import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { changeOrSetPassword, getPasswordStatus, PASSWORD_ERROR_MESSAGES } from '@server/passwordChange'

const failure = (reason) => NextResponse.json(
  { success: false, code: reason, error: PASSWORD_ERROR_MESSAGES[reason] },
  { status: reason === 'USER_NOT_FOUND' ? 404 : reason.startsWith('PASSWORD_') ? 409 : 400 }
)
export const GET = async () => {
  const { user, tenantId } = await getTenantContext()
  if (!user?._id || !tenantId) return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })
  await dbConnect()
  const result = await getPasswordStatus({ userId: user._id, tenantId })
  if (!result.ok) return failure(result.reason)
  return NextResponse.json({ success: true, hasPassword: result.hasPassword }, { headers: { 'Cache-Control': 'no-store' } })
}
export const POST = async (req) => {
  const { user, tenantId } = await getTenantContext()
  if (!user?._id || !tenantId) return NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  await dbConnect()
  const result = await changeOrSetPassword({ userId: user._id, tenantId, currentPassword: body?.currentPassword, newPassword: body?.newPassword })
  if (!result.ok) return failure(result.reason)
  return NextResponse.json({ success: true, mode: result.mode, hasPassword: true })
}
