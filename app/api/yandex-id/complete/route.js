import { NextResponse } from 'next/server'
import getTenantContext from '@server/getTenantContext'
import Users from '@models/Users'
import {
  enabled, readFlow, createFlow, appUrl, YANDEX_COOKIE,
  validPhone, normalizePhone, accountByPhone,
} from '@server/yandexAuth'

const reply = (data, status = 200) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'no-store' },
})
const pendingFlow = (req, consume = false) => readFlow(req.cookies.get(YANDEX_COOKIE)?.value, 'pending', consume)
const phoneError = 'Номер телефона Яндекса не совпадает с номером аккаунта. Войдите с тем же номером или исправьте номер в Яндекс ID.'
const resolveAccount = async (flow) => {
  const user = await accountByPhone(flow.phone)
  const owner = await Users.findOne({ yandexId: flow.yandexId })
  const conflict = owner && (!user || String(owner._id) !== String(user._id))
  return { user, conflict }
}

export const GET = async (req) => {
  if (!(await enabled())) return reply({ error: 'Вход через Яндекс отключён' }, 403)
  const flow = await pendingFlow(req)
  if (!flow) return reply({ error: 'Время подключения истекло. Начните вход через Яндекс заново.' }, 410)
  if (!validPhone(flow.phone)) return reply({ error: 'Яндекс не передал подходящий номер телефона. Начните вход заново и разрешите доступ к номеру.' }, 409)
  const { user, conflict } = await resolveAccount(flow)
  if (conflict || user?.archive) return reply({ error: phoneError }, 409)
  return reply({ linked: user?.yandexId === flow.yandexId, accountExists: Boolean(user), phone: flow.phone, referrerId: flow.referrerId || '' })
}

export const POST = async (req) => {
  if (!(await enabled())) return reply({ error: 'Вход через Яндекс отключён' }, 403)
  if (req.headers.get('origin') !== appUrl('/').origin)
    return reply({ error: 'Недопустимый источник запроса' }, 403)
  const body = await req.json().catch(() => ({}))
  if (!['login', 'link'].includes(body.action)) return reply({ error: 'Некорректное действие' }, 400)
  const flow = await pendingFlow(req)
  if (!flow) return reply({ error: 'Время подключения истекло' }, 410)
  if (!validPhone(flow.phone)) return reply({ error: 'Не получен телефон Яндекса. Начните вход заново.' }, 409)
  const account = await resolveAccount(flow)
  if (account.conflict || account.user?.archive) return reply({ error: phoneError }, 409)
  let user
  if (body.action === 'link') {
    const context = await getTenantContext()
    if (!context.user?._id || !context.tenantId || context.user.impersonation?.active)
      return reply({ error: 'Сначала войдите в свой аккаунт или зарегистрируйтесь' }, 401)
    // Reload DB identity, never trust phone/tenant/owner from the request.
    user = await Users.findOne({
      _id: context.user._id, tenantId: context.tenantId, archive: { $ne: true },
    })
    if (!user?.phone) return reply({ error: 'У аккаунта должен быть номер телефона' }, 403)
    if (normalizePhone(user.phone) !== flow.phone || String(account.user?._id) !== String(user._id))
      return reply({ error: phoneError }, 409)
    if (user.yandexId && user.yandexId !== flow.yandexId)
      return reply({ error: 'К аккаунту уже подключён другой Яндекс ID' }, 409)
    const owner = await Users.exists({ yandexId: flow.yandexId, _id: { $ne: user._id } })
    if (owner) return reply({ error: 'Этот Яндекс ID уже подключён к другому аккаунту' }, 409)
  } else {
    user = account.user
    if (!user?.tenantId || user.yandexId !== flow.yandexId) return reply({ error: 'Сначала подключите Яндекс к аккаунту' }, 409)
  }
  if (!(await pendingFlow(req, true))) return reply({ error: 'Запрос уже использован' }, 409)
  if (body.action === 'link') {
    try {
      await Users.init()
      user = await Users.findOneAndUpdate({
        _id: user._id, tenantId: user.tenantId, archive: { $ne: true },
        phone: user.phone,
        $or: [{ yandexId: { $exists: false } }, { yandexId: flow.yandexId }],
      }, { $set: { yandexId: flow.yandexId } }, { returnDocument: 'after' })
      if (!user) return reply({ error: 'Привязка изменилась. Начните заново.' }, 409)
    } catch {
      return reply({ error: 'Не удалось подключить Яндекс. Начните заново; существующие привязки сохранены.' }, 409)
    }
  }
  const token = await createFlow('ticket', {
    userId: user._id, tenantId: user.tenantId, yandexId: flow.yandexId, phone: flow.phone,
  })
  const response = reply({ token })
  response.cookies.delete(YANDEX_COOKIE)
  return response
}
