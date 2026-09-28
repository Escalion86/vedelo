import Users from '@models/Users'
import { randomInt } from 'node:crypto'

const TELEFONIP_TOKEN = process.env.TELEFONIP
const TELEFONIP_BASE_URL =
  process.env.TELEFONIP_API_BASE_URL || 'https://api.telefon-ip.ru'

const PHONE_VERIFY_TTL_MIN = Number(process.env.PHONE_VERIFY_TTL_MIN || 15)
const START_RATE_LIMIT_SEC = Number(process.env.PHONE_VERIFY_START_COOLDOWN_SEC || 60)
const CHECK_RATE_LIMIT_SEC = Number(process.env.PHONE_VERIFY_CHECK_COOLDOWN_SEC || 2)
const SMS_RATE_LIMIT_SEC = Number(process.env.PHONE_VERIFY_SMS_COOLDOWN_SEC || 60)
const MAX_SMS_SENDS = Number(process.env.PHONE_VERIFY_SMS_MAX_SENDS || 5)
const MAX_SMS_CHECK_TRIES = Number(process.env.PHONE_VERIFY_SMS_MAX_TRIES || 5)
const SMS_CODE_LENGTH = Number(process.env.PHONE_VERIFY_SMS_CODE_LENGTH || 4)

const sanitizeNumber = (value, fallback) =>
  Number.isFinite(value) && value > 0 ? value : fallback

export const verifyConfig = {
  ttlMin: sanitizeNumber(PHONE_VERIFY_TTL_MIN, 15),
  startCooldownSec: sanitizeNumber(START_RATE_LIMIT_SEC, 60),
  checkCooldownSec: sanitizeNumber(CHECK_RATE_LIMIT_SEC, 2),
  smsCooldownSec: sanitizeNumber(SMS_RATE_LIMIT_SEC, 60),
  maxSmsSends: sanitizeNumber(MAX_SMS_SENDS, 5),
  maxSmsCheckTries: sanitizeNumber(MAX_SMS_CHECK_TRIES, 5),
  smsCodeLength: Math.max(4, Math.min(sanitizeNumber(SMS_CODE_LENGTH, 4), 6)),
}

export const normalizePhone = (phone) => {
  if (!phone) return ''
  const digits = String(phone).replace(/[^\d]/g, '')
  if (digits.length === 10) return `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  if (digits.length === 11 && digits.startsWith('7')) return digits
  return digits
}

export const isValidNormalizedPhone = (phone) =>
  /^\d{11}$/.test(phone) && phone.startsWith('7')

export const toTelefonipPhone = (phone) => {
  if (!isValidNormalizedPhone(phone)) return ''
  return `8${phone.slice(1)}`
}

export const getExpiresAt = () =>
  new Date(Date.now() + verifyConfig.ttlMin * 60 * 1000)

const getPhoneQuery = (phone) => {
  const asNumber = Number(phone)
  return Number.isNaN(asNumber)
    ? { phone }
    : { $or: [{ phone }, { phone: asNumber }] }
}

export const findUserByPhone = async (phone) => Users.findOne(getPhoneQuery(phone))

export const validateFlow = (flow) => flow === 'register' || flow === 'recovery'

const ERROR_TYPE_BY_CODE = {
  INVALID_PHONE: 'phone',
  INVALID_PHONE_LENGTH: 'phone',
  PHONE_ALREADY_USED: 'phone',
  PHONE_NOT_FOUND: 'not_found',
  INVALID_SMS_CODE: 'code',
  SMS_CODE_INVALID: 'code',
  START_RATE_LIMIT: 'rate_limit',
  CHECK_RATE_LIMIT: 'rate_limit',
  SMS_RATE_LIMIT: 'rate_limit',
  SMS_SEND_LIMIT: 'rate_limit',
  SMS_CHECK_LIMIT: 'rate_limit',
  CONFIRM_NOT_FOUND: 'not_found',
  CONFIRM_EXPIRED: 'not_found',
  PHONE_NOT_CONFIRMED: 'not_found',
}

export const safeApiError = (code, message, field) => ({
  success: false,
  error: {
    type: ERROR_TYPE_BY_CODE[code] || 'unknown',
    message,
    field,
    code,
  },
})

const extractResponseData = (response) => {
  if (!response || typeof response !== 'object') return {}
  if (response.data && typeof response.data === 'object') return response.data
  return response
}

const tryParseJson = async (res) => {
  try {
    return await res.json()
  } catch (error) {
    return null
  }
}

const getTelefonipUrl = (path) =>
  `${TELEFONIP_BASE_URL.replace(/\/$/, '')}/api/v1/authcalls/${TELEFONIP_TOKEN}${path}`

const getTelefonipErrorMessage = (data) =>
  data?.error || data?.message || data?.detail || 'TELEFONIP request failed'

const buildTelefonipRequestError = (data) => {
  const message = getTelefonipErrorMessage(data)
  const lowerMessage = String(message).toLowerCase()
  if (lowerMessage.includes('token')) {
    return safeApiError('TELEFONIP_AUTH_ERROR', 'Ошибка авторизации TELEFONIP')
  }
  return safeApiError('TELEFONIP_REQUEST_ERROR', 'Не удалось выполнить запрос в TELEFONIP')
}

export const telefonipStartCall = async (phone) => {
  if (!TELEFONIP_TOKEN) {
    throw new Error('TELEFONIP token is not configured')
  }

  const telefonipPhone = toTelefonipPhone(phone)
  const res = await fetch(
    getTelefonipUrl(`/reverse_auth_phone_get?phone=${encodeURIComponent(telefonipPhone)}`),
    { method: 'GET', cache: 'no-store' }
  )
  const json = await tryParseJson(res)
  const data = extractResponseData(json)

  if (!res.ok || data?.status === 'error') {
    return {
      ok: false,
      error: buildTelefonipRequestError(data),
    }
  }

  const id = Number(data?.id ?? data?.callId ?? data?.call_id)
  if (!Number.isFinite(id)) {
    return {
      ok: false,
      error: safeApiError('TELEFONIP_BAD_RESPONSE', 'Некорректный ответ TELEFONIP'),
    }
  }

  return {
    ok: true,
    data: {
      id,
      auth_phone: data?.auth_phone || '',
      url_image: data?.url_image || '',
    },
  }
}

export const telefonipCheckCall = async (callId) => {
  if (!TELEFONIP_TOKEN) {
    throw new Error('TELEFONIP token is not configured')
  }

  const res = await fetch(getTelefonipUrl(`/reverse_auth_phone_check/${callId}`), {
    method: 'GET',
    cache: 'no-store',
  })
  const json = await tryParseJson(res)
  const data = extractResponseData(json)

  if (!res.ok || data?.status === 'error') {
    return {
      ok: false,
      error: buildTelefonipRequestError(data),
    }
  }

  const status = String(data?.status || data?.result || 'pending').toLowerCase()
  const authPhoneRaw = String(data?.auth_phone || data?.phone || '').replace(/[^\d]/g, '')
  const authPhone = authPhoneRaw.length === 11
    ? authPhoneRaw.startsWith('8')
      ? `7${authPhoneRaw.slice(1)}`
      : authPhoneRaw
    : ''

  return {
    ok: true,
    data: {
      status,
      authPhone,
    },
  }
}

export const generateSmsCode = () => {
  // Telefon-IP accepts at most four characters; custom webhooks retain their length.
  const length = process.env.PHONE_SMS_SEND_WEBHOOK ? verifyConfig.smsCodeLength : 4
  return String(randomInt(10 ** (length - 1), 10 ** length))
}

export const sendSmsCode = async ({ phone, code, flow }) => {
  const webhookUrl = process.env.PHONE_SMS_SEND_WEBHOOK
  if (!webhookUrl && TELEFONIP_TOKEN) {
    try {
      const response = await fetch(
        getTelefonipUrl(`/get_sms_code/${toTelefonipPhone(phone)}/?code=${encodeURIComponent(code)}`),
        { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(15000) }
      )
      const json = await tryParseJson(response)
      if (!response.ok || json?.success !== true || json?.data?.status === false ||
        String(json?.data?.code ?? '') !== code) {
        return { ok: false, error: safeApiError('SMS_SEND_ERROR', 'Не удалось отправить СМС-код. Попробуйте позже.') }
      }
      return { ok: true }
    } catch {
      // Provider URLs contain the API token and code: never log the fetch error.
      return { ok: false, error: safeApiError('SMS_SEND_ERROR', 'Сервис СМС временно недоступен') }
    }
  }
  if (!webhookUrl) {
    if (process.env.NODE_ENV === 'production') {
      return {
        ok: false,
        error: safeApiError(
          'SMS_PROVIDER_NOT_CONFIGURED',
          'SMS-провайдер не настроен'
        ),
      }
    }

    return { ok: true, debugCode: code }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, flow }),
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    return {
      ok: false,
      error: safeApiError(
        'SMS_SEND_ERROR',
        'Не удалось отправить SMS-код'
      ),
    }
  }

  return { ok: true }
}
