import crypto from 'crypto'

const PREFIX = 'm1'
const DEFAULT_TTL_MS = 10 * 60 * 1000

const encode = (value) => Buffer.from(value).toString('base64url')
const decode = (value) => Buffer.from(value, 'base64url').toString('utf8')
const signature = (value, secret) =>
  crypto.createHmac('sha256', secret).update(value).digest('base64url')

export const hashMobileOAuthState = (state) =>
  crypto.createHash('sha256').update(String(state || '')).digest('hex')

export const createMobileOAuthState = ({
  userId,
  tenantId,
  sessionId,
  appScheme = 'vedelo',
  secret,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
}) => {
  if (!userId || !tenantId || !sessionId || !secret) return ''
  const payload = encode(JSON.stringify({
    type: 'google-calendar',
    userId: String(userId),
    tenantId: String(tenantId),
    sessionId: String(sessionId),
    appScheme: ['vedelo', 'vedelo-dev', 'artistcrm', 'artistcrm-dev'].includes(appScheme)
      ? appScheme
      : 'vedelo',
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: now + ttlMs,
  }))
  const signedValue = `${PREFIX}.${payload}`
  return `${signedValue}.${signature(signedValue, secret)}`
}

export const verifyMobileOAuthState = (state, secret, now = Date.now()) => {
  const [prefix, payload, providedSignature] = String(state || '').split('.')
  if (prefix !== PREFIX || !payload || !providedSignature || !secret) return null
  const signedValue = `${prefix}.${payload}`
  const expectedSignature = signature(signedValue, secret)
  const provided = Buffer.from(providedSignature)
  const expected = Buffer.from(expectedSignature)
  if (provided.length !== expected.length) return null
  if (!crypto.timingSafeEqual(provided, expected)) return null
  try {
    const parsed = JSON.parse(decode(payload))
    if (parsed?.type !== 'google-calendar') return null
    if (!parsed.userId || !parsed.tenantId || !parsed.sessionId) return null
    if (!Number.isFinite(Number(parsed.exp)) || Number(parsed.exp) <= now) return null
    return parsed
  } catch {
    return null
  }
}

export const isMobileOAuthState = (state) =>
  String(state || '').startsWith(`${PREFIX}.`)
