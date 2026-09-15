import { NextResponse } from 'next/server'
import MobileSessions from '@models/MobileSessions'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getAuthSecret from '@server/getAuthSecret'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  getOAuthClient,
  normalizeCalendarReminders,
  normalizeCalendarSettings,
  normalizeCalendarStatusColors,
  normalizeCalendarSyncSettings,
} from '@server/googleUserCalendarClient'
import {
  hashMobileOAuthState,
  verifyMobileOAuthState,
} from './oauthState.js'

const mobileRedirect = (params = {}, appScheme = 'vedelo') => {
  const allowedScheme = ['vedelo', 'vedelo-dev', 'artistcrm', 'artistcrm-dev'].includes(appScheme)
    ? appScheme
    : 'vedelo'
  const url = new URL(`${allowedScheme}://more/integrations`)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return new NextResponse(null, {
    status: 307,
    headers: { location: url.toString() },
  })
}

export const handleMobileGoogleCalendarCallback = async ({ code, state }) => {
  const payload = verifyMobileOAuthState(state, getAuthSecret())
  if (!payload) return mobileRedirect({ gc_error: 'state' })

  await dbConnect()
  const now = new Date()
  const session = await MobileSessions.findOneAndUpdate(
    {
      _id: payload.sessionId,
      userId: payload.userId,
      tenantId: payload.tenantId,
      revokedAt: null,
      expiresAt: { $gt: now },
      googleOAuthStateHash: hashMobileOAuthState(state),
      googleOAuthStateExpiresAt: { $gt: now },
    },
    {
      $unset: {
        googleOAuthStateHash: 1,
        googleOAuthStateExpiresAt: 1,
      },
    },
    { returnDocument: 'after' }
  ).lean()
  if (!session || !code) return mobileRedirect({ gc_error: 'state' }, payload.appScheme)

  const access = await getUserTariffAccess(payload.userId)
  if (!access?.allowCalendarSync) {
    return mobileRedirect({ gc_error: 'tariff' }, payload.appScheme)
  }

  const oauth = getOAuthClient()
  if (!oauth) return mobileRedirect({ gc_error: 'config' }, payload.appScheme)

  try {
    const { tokens } = await oauth.getToken(code)
    const user = await Users.findOne({
      _id: payload.userId,
      tenantId: payload.tenantId,
      archive: { $ne: true },
    })
    if (!user) return mobileRedirect({ gc_error: 'user' }, payload.appScheme)
    const previous = normalizeCalendarSettings(user)
    user.googleCalendar = {
      ...previous,
      enabled: true,
      calendarId: previous.calendarId || 'primary',
      refreshToken: tokens.refresh_token || previous.refreshToken || '',
      accessToken: tokens.access_token || previous.accessToken || '',
      tokenExpiry: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : previous.tokenExpiry || null,
      scope: tokens.scope || previous.scope || '',
      syncToken: '',
      connectedAt: new Date(),
      reminders: normalizeCalendarReminders(previous.reminders),
      statusColors: normalizeCalendarStatusColors(previous.statusColors),
      syncSettings: normalizeCalendarSyncSettings(previous.syncSettings),
    }
    await user.save()
    return mobileRedirect({ gc_connected: '1' }, payload.appScheme)
  } catch (error) {
    console.error('[mobile/google-calendar/callback]', error?.message || error)
    return mobileRedirect({ gc_error: 'exchange' }, payload.appScheme)
  }
}
