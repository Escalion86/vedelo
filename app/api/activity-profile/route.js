import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { saveActivityProfile } from '@server/activityProfile'
import {
  canEditActivityProfile,
  getActivityProfile,
  validateActivityProfile,
} from '@helpers/activityProfile.mjs'

const respond = (body, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })

const fail = (status, code, message, field) =>
  respond({
    success: false,
    error: {
      code,
      message,
      type: status === 401 ? 'auth' : 'validation',
      ...(field ? { field } : {}),
    },
  }, status)

export const GET = async (request) => {
  const context = await getRequestContext(request)
  if (!context.user?._id || !context.tenantId)
    return fail(401, 'UNAUTHORIZED', 'Не авторизован')
  await dbConnect()
  const settings = await SiteSettings.findOne({ tenantId: context.tenantId })
    .select('custom.firstRunWizardCompleted custom.onboardingActivityPreset custom.onboardingActivityOtherDescription custom.primaryEntityTerminology')
    .lean()
  return respond({ success: true, data: getActivityProfile(settings, canEditActivityProfile(context)) })
}

export const PATCH = async (request) => {
  const context = await getRequestContext(request)
  if (!context.user?._id || !context.tenantId)
    return fail(401, 'UNAUTHORIZED', 'Не авторизован')
  if (!canEditActivityProfile(context))
    return fail(403, 'FORBIDDEN', 'Сферу деятельности может изменить владелец пространства')

  const validation = validateActivityProfile(await request.json().catch(() => null))
  if (!validation.value) {
    const { code, message, field } = validation
    return fail(400, code, message, field)
  }
  await dbConnect()
  const data = await saveActivityProfile(context.tenantId, validation.value)
  return data
    ? respond({ success: true, data })
    : fail(409, 'ACTIVITY_CONFLICT', 'Настройки изменились. Повторите сохранение')
}
