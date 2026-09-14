import { NextResponse } from 'next/server'

import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { handleMobileGoogleCalendarCallback } from '@server/mobile/googleCalendarOAuth'
import { isMobileOAuthState } from '@server/mobile/oauthState'
import {
  getOAuthClient,
  normalizeCalendarReminders,
  normalizeCalendarSyncSettings,
  normalizeCalendarStatusColors,
} from '@server/googleUserCalendarClient'
import { resolveTrustedRequestOrigin } from '@server/trustedOrigin'

export const runtime = 'nodejs'

const decodeState = (value) => {
  if (!value) return null
  try {
    const raw = Buffer.from(value, 'base64url').toString('utf8')
    return JSON.parse(raw)
  } catch (error) {
    return null
  }
}

export const GET = async (req) => {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  if (isMobileOAuthState(state)) {
    return handleMobileGoogleCalendarCallback({ code, state })
  }

  const { user } = await getTenantContext()
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const cookieState = req.cookies.get('gc_oauth_state')?.value

  if (!code) {
    return NextResponse.json(
      { success: false, error: 'Отсутствует код авторизации' },
      { status: 400 }
    )
  }

  const decodedState = decodeState(state)
  const redirect = decodedState?.redirect || '/cabinet/profile'
  const importConnection = decodedState?.purpose === 'import'
  const baseUrl = resolveTrustedRequestOrigin(req, decodedState?.origin)
  const oauth = getOAuthClient(`${baseUrl}/api/google-calendar/callback`)
  if (!oauth) {
    return NextResponse.json(
      { success: false, error: 'Google OAuth не настроен' },
      { status: 500 }
    )
  }
  if (!decodedState?.nonce || decodedState.nonce !== cookieState) {
    const response = NextResponse.redirect(
      new URL(`${redirect}?gc_error=state`, baseUrl)
    )
    response.cookies.delete('gc_oauth_state')
    return response
  }

  const access = await getUserTariffAccess(user._id)
  if (!access?.allowCalendarSync || (importConnection && !access?.allowAi)) {
    const response = NextResponse.redirect(
      new URL(`${redirect}?gc_error=tariff`, baseUrl)
    )
    response.cookies.delete('gc_oauth_state')
    return response
  }

  const { tokens } = await oauth.getToken(code)
  await dbConnect()
  const existing = await Users.findById(user._id)
  if (!existing) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const prev = importConnection
    ? (existing.googleCalendarImport ?? {})
    : (existing.googleCalendar ?? {})
  const refreshToken = tokens.refresh_token || prev.refreshToken || ''
  const accessToken = tokens.access_token || prev.accessToken || ''
  const tokenExpiry =
    tokens.expiry_date ? new Date(tokens.expiry_date) : prev.tokenExpiry || null
  if (importConnection) {
    existing.googleCalendarImport = {
      enabled: true,
      calendarId: '',
      calendarName: '',
      refreshToken,
      accessToken,
      tokenExpiry,
      scope: tokens.scope || prev.scope || '',
      connectedAt: new Date(),
      email: prev.email || '',
    }
  } else {
    const reminders = normalizeCalendarReminders(prev.reminders)
    const statusColors = normalizeCalendarStatusColors(prev.statusColors)
    const syncSettings = normalizeCalendarSyncSettings(prev.syncSettings)
    const deleteCanceledFromCalendar =
      prev?.deleteCanceledFromCalendar === true
    const skipTransferredFromCalendar =
      prev?.skipTransferredFromCalendar === true

    existing.googleCalendar = {
      enabled: true,
      calendarId: prev.calendarId || 'primary',
      calendarName: prev.calendarName || '',
      refreshToken,
      accessToken,
      tokenExpiry,
      scope: tokens.scope || prev.scope || '',
      syncToken: '',
      connectedAt: new Date(),
      email: prev.email || '',
      reminders,
      statusColors,
      syncSettings,
      deleteCanceledFromCalendar,
      skipTransferredFromCalendar,
    }
  }

  await existing.save()

  const redirectUrl = new URL(redirect, baseUrl)
  redirectUrl.searchParams.set('gc_connected', '1')
  const response = NextResponse.redirect(redirectUrl)
  response.cookies.delete('gc_oauth_state')
  return response
}
