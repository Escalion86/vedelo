import { createHash, randomBytes } from 'node:crypto'
import YandexAuthFlows from '@models/YandexAuthFlows'
import Users from '@models/Users'
import { getSocialAuthSettings } from '@server/socialAuthSettings'
import { normalizePhone, isValidNormalizedPhone, findUserByPhone } from '@server/phoneVerification'

export { normalizePhone }
export const validPhone = (phone) => typeof phone === 'string' && isValidNormalizedPhone(phone)
export const accountByPhone = findUserByPhone

export const YANDEX_COOKIE = 'vedelo_yandex_flow'
export const hashToken = (value) => createHash('sha256').update(String(value)).digest('hex')
export const randomToken = () => randomBytes(32).toString('base64url')
export const cookieOptions = () => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', path: '/', maxAge: 15 * 60,
})
export const callbackUrl = () => new URL(process.env.YANDEX_ID_REDIRECT_URI)
export const appUrl = (path) => new URL(path, callbackUrl().origin)
export const enabled = async () => (await getSocialAuthSettings()).allowYandexAuth

const mobileRedirects = new Set(['vedelo', 'artistcrm', 'vedelo-dev', 'artistcrm-dev']
  .flatMap(scheme => [`${scheme}://auth/yandex`, `${scheme}://auth/yandex-link`]))
export const mobileFlowFields = (params) => {
  const mobileRedirect = params.get('mobileRedirect')
  if (!mobileRedirect && !params.has('mobileChallenge') && !params.has('mobileState')) return {}
  const mobileChallenge = params.get('mobileChallenge'), mobileState = params.get('mobileState')
  if (!mobileRedirects.has(mobileRedirect) || !/^[\w-]{43}$/.test(mobileChallenge || '') || !/^[\w-]{43}$/.test(mobileState || ''))
    throw new Error('INVALID_MOBILE_FLOW')
  return { mobileRedirect, mobileChallenge, mobileState }
}
export const mobileFlowUrl = (flow, fields) => {
  if (!mobileRedirects.has(flow?.mobileRedirect)) return null
  const url = new URL(flow.mobileRedirect)
  url.search = new URLSearchParams({ ...fields, state: flow.mobileState }).toString()
  return url
}
export const readMobileFlow = (code, verifier, consume = false) => {
  if (typeof code !== 'string' || !/^[\w-]{43}$/.test(code) || typeof verifier !== 'string' || !/^[\w-]{43,128}$/.test(verifier)) return null
  // Bind the one-time return code to this installation's in-memory proof. A custom
  // scheme handler intercepting the redirect cannot redeem it without the verifier.
  const filter = {
    hash: hashToken(code), kind: 'mobile', expiresAt: { $gt: new Date() },
    mobileChallenge: createHash('sha256').update(verifier).digest('base64url'),
  }
  return consume ? YandexAuthFlows.findOneAndDelete(filter) : YandexAuthFlows.findOne(filter)
}

const authError = (message, status = 409) => Object.assign(new Error(message), { status })
const phoneError = 'Номер телефона Яндекса не совпадает с номером аккаунта. Войдите с тем же номером или исправьте номер в Яндекс ID.'
export const resolveYandexAccount = async (flow) => {
  if (!validPhone(flow.phone)) throw authError('Не получен телефон Яндекса. Начните вход заново.')
  const user = await accountByPhone(flow.phone)
  const owner = await Users.findOne({ yandexId: flow.yandexId })
  if (user?.archive || (owner && (!user || String(owner._id) !== String(user._id)))) throw authError(phoneError)
  return user
}
export const completeYandexAccount = async ({ flow, action, context, consume }) => {
  const account = await resolveYandexAccount(flow)
  let user = account
  if (action === 'link') {
    if (!context?.user?._id || !context.tenantId || context.user.impersonation?.active)
      throw authError('Сначала войдите в свой аккаунт или зарегистрируйтесь', 401)
    user = await Users.findOne({ _id: context.user._id, tenantId: context.tenantId, archive: { $ne: true } })
    if (!user?.phone) throw authError('У аккаунта должен быть номер телефона', 403)
    if (normalizePhone(user.phone) !== flow.phone || String(account?._id) !== String(user._id)) throw authError(phoneError)
  } else if (action !== 'login') throw authError('Некорректное действие', 400)
  if (!user) throw authError('Зарегистрируйтесь с номером из Яндекс ID')
  if (action === 'login' && !user.yandexId && user.yandexUnlinkedAt)
    throw authError('Яндекс ID отключён. Войдите другим способом и подключите его в профиле.', 403)
  if (user.yandexId && user.yandexId !== flow.yandexId) throw authError('К аккаунту уже подключён другой Яндекс ID')
  if (!(await consume())) throw authError('Запрос уже использован')
  // Shared by PWA and Android. Ignore client-supplied phone, owner and tenant.
  try {
    await Users.init()
    user = await Users.findOneAndUpdate({
      _id: user._id, tenantId: user.tenantId || null, archive: { $ne: true }, phone: user.phone,
      yandexUnlinkedAt: user.yandexUnlinkedAt || null,
      $or: [{ yandexId: { $exists: false } }, { yandexId: flow.yandexId }],
    }, { $set: { yandexId: flow.yandexId, tenantId: user.tenantId || user._id } }, { returnDocument: 'after' })
  } catch { throw authError('Не удалось подключить Яндекс. Начните заново; существующие привязки сохранены.') }
  if (!user) throw authError('Привязка изменилась. Начните заново.')
  return user
}

export const createFlow = async (kind, fields = {}) => {
  const secret = randomToken()
  await YandexAuthFlows.create({
    ...fields, kind, hash: hashToken(secret),
    expiresAt: new Date(Date.now() + (kind === 'ticket' ? 60 : 900) * 1000),
  })
  return secret
}
export const readFlow = (secret, kind, consume = false) => {
  if (typeof secret !== 'string' || !/^[\w-]{43}$/.test(secret)) return null
  const filter = { hash: hashToken(secret), kind, expiresAt: { $gt: new Date() } }
  return consume
    ? YandexAuthFlows.findOneAndDelete(filter)
    : YandexAuthFlows.findOne(filter)
}

export const exchangeProfile = async (code, verifier) => {
  const response = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, code_verifier: verifier,
      client_id: process.env.YANDEX_ID_CLIENT_ID,
      client_secret: process.env.YANDEX_ID_CLIENT_SECRET,
      redirect_uri: callbackUrl().href,
    }),
  })
  if (!response.ok) throw new Error('YANDEX_EXCHANGE_FAILED')
  const token = await response.json()
  if (!token.access_token) throw new Error('YANDEX_TOKEN_MISSING')
  const result = await fetch('https://login.yandex.ru/info?format=json', {
    headers: { Authorization: `OAuth ${token.access_token}` },
    cache: 'no-store', signal: AbortSignal.timeout(10000),
  })
  if (!result.ok) throw new Error('YANDEX_PROFILE_FAILED')
  const profile = await result.json()
  if (profile.client_id !== process.env.YANDEX_ID_CLIENT_ID ||
      !/^\d{1,64}$/.test(String(profile.id || '')))
    throw new Error('YANDEX_PROFILE_INVALID')
  const phone = normalizePhone(profile.default_phone?.number)
  if (!validPhone(phone)) throw new Error('YANDEX_PHONE_REQUIRED')
  return { yandexId: String(profile.id), phone }
}

export const consumeYandexTicket = async (token) => {
  if (!(await enabled())) return null
  const ticket = await readFlow(token, 'ticket', true)
  if (!ticket || !validPhone(ticket.phone)) return null
  const user = await Users.findOne({
    _id: ticket.userId, tenantId: ticket.tenantId,
    yandexId: ticket.yandexId, yandexUnlinkedAt: ticket.yandexUnlinkedAt || null, archive: { $ne: true },
  })
  if (!user || normalizePhone(user.phone) !== ticket.phone) return null
  return {
    id: String(user._id), tenantId: String(user.tenantId),
    phone: user.phone, role: user.role ?? 'user',
    firstName: user.firstName ?? '', secondName: user.secondName ?? '',
    tariffId: user.tariffId?.toString() ?? null,
  }
}
