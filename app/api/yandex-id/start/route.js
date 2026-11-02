import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { checkRateLimit, rateLimitResponse } from '@server/rateLimit'
import {
  enabled, createFlow, randomToken, callbackUrl, appUrl, YANDEX_COOKIE, cookieOptions, mobileFlowFields,
} from '@server/yandexAuth'

export const GET = async (req) => {
  if (!(await enabled())) return NextResponse.json({ error: 'Вход через Яндекс отключён' }, { status: 403 })
  const requestHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host
  if (requestHost !== appUrl('/').host) {
    const canonical = appUrl('/api/yandex-id/start')
    canonical.search = req.nextUrl.search
    return NextResponse.redirect(canonical)
  }
  const limit = await checkRateLimit({ req, scope: 'yandex_start', limit: 20, windowMs: 600000 })
  if (!limit.ok) return rateLimitResponse(NextResponse, limit)
  const verifier = randomToken()
  const ref = req.nextUrl.searchParams.get('ref') || ''
  const referrerId = /^[a-f\d]{24}$/i.test(ref) ? ref : ''
  let mobile
  try { mobile = mobileFlowFields(req.nextUrl.searchParams) }
  catch { return NextResponse.json({ error: 'Некорректный возврат в приложение' }, { status: 400 }) }
  const state = await createFlow('oauth', { verifier, referrerId, ...mobile })
  const url = new URL('https://oauth.yandex.ru/authorize')
  url.search = new URLSearchParams({
    response_type: 'code', client_id: process.env.YANDEX_ID_CLIENT_ID,
    redirect_uri: callbackUrl().href, state,
    scope: 'login:info login:default_phone',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString()
  const response = NextResponse.redirect(url)
  response.cookies.set(YANDEX_COOKIE, state, cookieOptions())
  response.headers.set('Cache-Control', 'no-store')
  return response
}
