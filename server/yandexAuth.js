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
    yandexId: ticket.yandexId, archive: { $ne: true },
  })
  if (!user || normalizePhone(user.phone) !== ticket.phone) return null
  return {
    id: String(user._id), tenantId: String(user.tenantId),
    phone: user.phone, role: user.role ?? 'user',
    firstName: user.firstName ?? '', secondName: user.secondName ?? '',
    tariffId: user.tariffId?.toString() ?? null,
  }
}
