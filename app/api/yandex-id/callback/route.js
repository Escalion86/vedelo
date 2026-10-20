import { NextResponse } from 'next/server'
import {
  enabled, readFlow, createFlow, exchangeProfile, appUrl, YANDEX_COOKIE, cookieOptions,
} from '@server/yandexAuth'

export const GET = async (req) => {
  try {
    if (!(await enabled())) throw new Error('DISABLED')
    const state = req.nextUrl.searchParams.get('state')
    const code = req.nextUrl.searchParams.get('code')
    if (!state || state !== req.cookies.get(YANDEX_COOKIE)?.value || !code || code.length > 2048)
      throw new Error('INVALID_CALLBACK')
    const flow = await readFlow(state, 'oauth', true)
    if (!flow) throw new Error('EXPIRED')
    const profile = await exchangeProfile(code, flow.verifier)
    const pending = await createFlow('pending', { ...profile, referrerId: flow.referrerId })
    const response = NextResponse.redirect(appUrl('/auth/yandex/complete'))
    response.cookies.set(YANDEX_COOKIE, pending, cookieOptions())
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch (error) {
    // Never echo provider responses, callback codes or tokens.
    const reason = error.message === 'YANDEX_PHONE_REQUIRED' ? 'phone_required' : '1'
    const response = NextResponse.redirect(new URL(`/auth/yandex/complete?error=${reason}`, process.env.YANDEX_ID_REDIRECT_URI || req.url))
    response.cookies.delete(YANDEX_COOKIE)
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }
}
