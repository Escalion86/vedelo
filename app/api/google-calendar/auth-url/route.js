import { NextResponse } from 'next/server'
import crypto from 'crypto'

import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  getOAuthClient,
  READ_SCOPE,
  WRITE_SCOPE,
} from '@server/googleUserCalendarClient'
import { resolveTrustedRequestOrigin } from '@server/trustedOrigin'

export const runtime = 'nodejs'

const encodeState = (payload) =>
  Buffer.from(JSON.stringify(payload)).toString('base64url')

const normalizeBaseUrl = (value) => {
  if (!value) return null
  const trimmed = String(value).trim().replace(/\/+$/, '')
  if (!trimmed) return null
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  return `https://${trimmed}`
}

export const GET = async (req) => {
  const { user } = await getTenantContext()
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const access = await getUserTariffAccess(user._id)
  const purpose =
    req.nextUrl.searchParams.get('purpose') === 'import' ? 'import' : 'sync'
  if (
    !access?.allowCalendarSync ||
    (purpose === 'import' && !access?.allowAi)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          purpose === 'import'
            ? 'Импорт недоступен по тарифу'
            : 'Синхронизация недоступна по тарифу',
      },
      { status: 403 }
    )
  }

  const requestOrigin = resolveTrustedRequestOrigin(req)
  const oauth = getOAuthClient(`${requestOrigin}/api/google-calendar/callback`)
  if (!oauth) {
    return NextResponse.json(
      { success: false, error: 'Google OAuth не настроен' },
      { status: 500 }
    )
  }

  await dbConnect()
  const dbUser = await Users.findById(user._id).select('_id').lean()
  if (!dbUser?._id) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const redirect = req.nextUrl.searchParams.get('redirect') || '/cabinet/profile'
  const nonce = crypto.randomBytes(16).toString('hex')
  const state = encodeState({ nonce, redirect, purpose, origin: requestOrigin })

  const url = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [purpose === 'import' ? READ_SCOPE : WRITE_SCOPE],
    state,
  })

  const response = NextResponse.json({ success: true, data: { url } })
  const baseUrl = normalizeBaseUrl(requestOrigin)
  const hostname = baseUrl ? new URL(baseUrl).hostname : req.nextUrl.hostname
  const cleanHost = hostname?.startsWith('www.')
    ? hostname.replace(/^www\./, '')
    : hostname
  const cookieDomain = cleanHost && cleanHost.includes('.') ? cleanHost : undefined
  response.cookies.set('gc_oauth_state', nonce, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    domain: cookieDomain,
  })
  return response
}
