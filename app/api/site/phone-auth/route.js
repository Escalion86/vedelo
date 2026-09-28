import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import getTenantContext from '@server/getTenantContext'
import { getTelefonipBalance } from '@server/telefonipBalance'
import {
  getPhoneAuthSettings,
  getPhoneProviderStatus,
} from '@server/phoneAuthSettings'

const error = (message, status) =>
  NextResponse.json({ success: false, error: { message } }, { status })
const canManage = ({ user, tenantId }) =>
  Boolean(
    tenantId && user?._id && user.role === 'dev' && !user.impersonation?.active
  )

export const GET = async () => {
  if (!canManage(await getTenantContext())) return error('Нет доступа', 403)
  return NextResponse.json({
    success: true,
    data: {
      ...(await getPhoneAuthSettings()),
      ...getPhoneProviderStatus(),
      telefonipBalance: await getTelefonipBalance(),
    },
  })
}

export const POST = async (req) => {
  if (!canManage(await getTenantContext())) return error('Нет доступа', 403)
  const body = await req.json().catch(() => ({}))
  if (!['call', 'sms'].includes(body.primaryMethod))
    return error('Выберите звонок или СМС', 400)
  const status = getPhoneProviderStatus()
  if (
    !(body.primaryMethod === 'sms'
      ? status.smsConfigured
      : status.callConfigured)
  ) {
    return error('Провайдер выбранного способа не настроен на сервере', 400)
  }
  await getPhoneAuthSettings()
  await SiteSettings.findOneAndUpdate(
    { tenantId: null },
    { $set: { 'phoneVerification.primaryMethod': body.primaryMethod } },
    { upsert: true, returnDocument: 'after', runValidators: true }
  )
  return NextResponse.json({
    success: true,
    data: { primaryMethod: body.primaryMethod, ...status },
  })
}
