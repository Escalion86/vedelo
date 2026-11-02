import getRequestContext from '@server/getRequestContext'
import { checkRateLimit, rateLimitResponse } from '@server/rateLimit'
import { NextResponse } from 'next/server'
import { enabled, readMobileFlow, resolveYandexAccount, completeYandexAccount } from '@server/yandexAuth'
import { createMobileSession } from '@server/mobile/sessions'
import { getMobileDevice, mobileError, mobileSuccess } from '@server/mobile/routeHelpers'

export const POST = async (req) => {
  const reply = await complete(req)
  reply.headers.set('Cache-Control', 'no-store')
  return reply
}
async function complete(req) {
  if (!(await enabled())) return mobileError('YANDEX_DISABLED', 'Вход через Яндекс отключён', 403)
  const limit = await checkRateLimit({ req, scope: 'mobile_yandex_complete', limit: 30, windowMs: 600000 })
  if (!limit.ok) return rateLimitResponse(NextResponse, limit)
  const body = await req.json().catch(() => ({}))
  if (!['inspect', 'login', 'link'].includes(body?.action)) return mobileError('INVALID_ACTION', 'Некорректное действие')
  try {
    const flow = await readMobileFlow(body.code, body.verifier)
    if (!flow) return mobileError('YANDEX_EXPIRED', 'Время подключения истекло. Начните вход через Яндекс заново.', 410)
    if (body.action === 'inspect') {
      const user = await resolveYandexAccount(flow)
      return mobileSuccess({ accountExists: Boolean(user), phone: flow.phone, referrerId: flow.referrerId || '' })
    }
    let context
    if (body.action === 'link') {
      context = await getRequestContext(req)
      if (!context.mobileSessionId || !context.tenantId) return mobileError('UNAUTHORIZED', 'Сначала войдите в свой аккаунт', 401)
    }
    const user = await completeYandexAccount({
      flow, action: body.action, context,
      consume: () => readMobileFlow(body.code, body.verifier, true),
    })
    if (body.action === 'link') return mobileSuccess({ linked: true })
    return mobileSuccess(await createMobileSession({ user, device: getMobileDevice(req, body) }))
  } catch (error) {
    return mobileError('YANDEX_AUTH_FAILED', error.status ? error.message : 'Не удалось завершить вход через Яндекс', error.status || 500)
  }
}
