import { NextResponse } from 'next/server'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { enabled, normalizePhone, validPhone } from '@server/yandexAuth'

const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const sameOrigin = (req) => {
  const url = new URL(req.url)
  const host = req.headers.get('host') || url.host
  const protocol = req.headers.get('x-forwarded-proto') === 'https' ? 'https:' : url.protocol
  return req.headers.get('origin') === `${protocol}//${host}`
}
const accountScope = ({ user, tenantId, authType, mobileSessionId }) => {
  if (!user?._id || !tenantId || user.impersonation?.active || (authType === 'mobile' && !mobileSessionId)) return null
  return {
    _id: user._id, archive: { $ne: true },
    tenantId: String(user._id) === String(tenantId) ? { $in: [tenantId, null] } : tenantId,
  }
}

export async function GET(req) {
  const scope = accountScope(await getRequestContext(req))
  if (!scope) return reply({ success: false, error: 'Откройте собственный профиль' }, 401)
  await dbConnect()
  const user = await Users.findOne(scope).select('yandexId').lean()
  if (!user) return reply({ success: false, error: 'Аккаунт не найден' }, 404)
  return reply({ success: true, data: { linked: Boolean(user.yandexId), enabled: await enabled() } })
}

export async function DELETE(req) {
  const context = await getRequestContext(req)
  const scope = accountScope(context)
  if (!scope) return reply({ success: false, error: 'Откройте собственный профиль' }, 401)
  if (context.authType === 'web' && !sameOrigin(req))
    return reply({ success: false, error: 'Недопустимый источник запроса' }, 403)
  await dbConnect()
  const user = await Users.findOne(scope).select('phone password yandexId yandexUnlinkedAt').lean()
  if (!user) return reply({ success: false, error: 'Аккаунт не найден' }, 404)
  if (!user.yandexId) return reply({ success: true, data: { linked: false } })
  if (!validPhone(normalizePhone(user.phone)) || !user.password)
    return reply({ success: false, error: 'Сначала убедитесь, что можете входить по телефону и паролю. При необходимости задайте пароль в профиле.' }, 409)
  const result = await Users.updateOne(
    { ...scope, yandexId: user.yandexId, phone: user.phone, password: user.password },
    { $unset: { yandexId: '' }, $set: { yandexUnlinkedAt: new Date() } }
  )
  if (!result.matchedCount && await Users.exists({ ...scope, yandexId: { $exists: true } }))
    return reply({ success: false, error: 'Данные входа изменились. Обновите профиль и повторите действие.' }, 409)
  return reply({ success: true, data: { linked: false } })
}
