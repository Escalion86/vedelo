import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import getTenantContext from '@server/getTenantContext'
import { getTelefonipBalance } from '@server/telefonipBalance'
import { getSocialAuthSettings } from '@server/socialAuthSettings'
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
      ...(await getSocialAuthSettings()),
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
  const currentSocial = await getSocialAuthSettings()
  for (const key of ['vkEnabled', 'yandexEnabled']) {
    if (body[key] !== undefined && typeof body[key] !== 'boolean')
      return error('Некорректная настройка входа', 400)
  }
  const vkEnabled = body.vkEnabled ?? currentSocial.vkEnabled
  const yandexEnabled = body.yandexEnabled ?? currentSocial.yandexEnabled
  if ((vkEnabled && !currentSocial.vkConfigured) || (yandexEnabled && !currentSocial.yandexConfigured))
    return error('Сначала настройте ключи и адрес возврата выбранного провайдера на сервере', 400)
  const currentPhone = await getPhoneAuthSettings()
  if (
    body.primaryMethod !== currentPhone.primaryMethod &&
    !(body.primaryMethod === 'sms'
      ? status.smsConfigured
      : status.callConfigured)
  ) {
    return error('Провайдер выбранного способа не настроен на сервере', 400)
  }
  await getPhoneAuthSettings()
  await SiteSettings.findOneAndUpdate(
    { tenantId: null },
    { $set: {
      'phoneVerification.primaryMethod': body.primaryMethod,
      'socialAuth.vkEnabled': vkEnabled,
      'socialAuth.yandexEnabled': yandexEnabled,
    } },
    { upsert: true, returnDocument: 'after', runValidators: true }
  )
  return NextResponse.json({
    success: true,
    data: { primaryMethod: body.primaryMethod, ...status, ...(await getSocialAuthSettings()) },
  })
}
