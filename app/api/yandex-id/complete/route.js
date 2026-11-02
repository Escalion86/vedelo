import { NextResponse } from 'next/server'
import getTenantContext from '@server/getTenantContext'
import {
  enabled, readFlow, createFlow, appUrl, YANDEX_COOKIE,
  resolveYandexAccount, completeYandexAccount,
} from '@server/yandexAuth'

const reply = (data, status = 200) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'no-store' },
})
const pendingFlow = (req, consume = false) => readFlow(req.cookies.get(YANDEX_COOKIE)?.value, 'pending', consume)
const failure = (error) => reply({ error: error.status ? error.message : 'Не удалось завершить вход через Яндекс' }, error.status || 500)

export const GET = async (req) => {
  if (!(await enabled())) return reply({ error: 'Вход через Яндекс отключён' }, 403)
  const flow = await pendingFlow(req)
  if (!flow) return reply({ error: 'Время подключения истекло. Начните вход через Яндекс заново.' }, 410)
  try {
    const user = await resolveYandexAccount(flow)
    return reply({ linked: user?.yandexId === flow.yandexId, accountExists: Boolean(user), phone: flow.phone, referrerId: flow.referrerId || '' })
  } catch (error) { return failure(error) }
}

export const POST = async (req) => {
  if (!(await enabled())) return reply({ error: 'Вход через Яндекс отключён' }, 403)
  if (req.headers.get('origin') !== appUrl('/').origin)
    return reply({ error: 'Недопустимый источник запроса' }, 403)
  const body = await req.json().catch(() => ({}))
  if (!['login', 'link'].includes(body?.action)) return reply({ error: 'Некорректное действие' }, 400)
  const flow = await pendingFlow(req)
  if (!flow) return reply({ error: 'Время подключения истекло' }, 410)
  try {
    const user = await completeYandexAccount({
      flow, action: body.action,
      context: body.action === 'link' ? await getTenantContext() : null,
      consume: () => pendingFlow(req, true),
    })
    const token = await createFlow('ticket', {
      userId: user._id, tenantId: user.tenantId, yandexId: flow.yandexId, phone: flow.phone,
    })
    const response = reply({ token })
    response.cookies.delete(YANDEX_COOKIE)
    return response
  } catch (error) { return failure(error) }
}
