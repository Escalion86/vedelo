import { NextResponse } from 'next/server'
import MobileSessions from '@models/MobileSessions'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getAuthSecret from '@server/getAuthSecret'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { googleImportUserFilter } from '@server/googleImportContext'
import {
  getOAuthClient,
  normalizeCalendarReminders,
  normalizeCalendarSettings,
  normalizeCalendarStatusColors,
  normalizeCalendarSyncSettings,
  normalizeImportCalendarSettings,
} from '@server/googleUserCalendarClient'
import {
  hashMobileOAuthState,
  verifyMobileOAuthState,
} from './oauthState.js'

const mobileRedirect = (params = {}, appScheme = 'vedelo', purpose = 'sync') => {
  const allowedScheme = ['vedelo', 'vedelo-dev', 'artistcrm', 'artistcrm-dev'].includes(appScheme)
    ? appScheme
    : 'vedelo'
  const url = new URL(`${allowedScheme}://more/${purpose === 'import' ? 'import' : 'integrations'}`)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return new NextResponse(null, {
    status: 307,
    headers: { location: url.toString() },
  })
}

export const handleMobileGoogleCalendarCallback = async ({ code, state }) => {
  const payload = verifyMobileOAuthState(state, getAuthSecret())
  if (!payload) return mobileRedirect({ gc_error: 'state' })
  const redirect = params => mobileRedirect(params, payload.appScheme, payload.purpose)

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
  if (!session || !code) return redirect({ gc_error: 'state' })

  const access = await getUserTariffAccess(payload.userId)
  if (!access?.allowCalendarSync || (payload.purpose === 'import' && !access?.allowAi)) {
    return redirect({ gc_error: 'tariff' })
  }

  const oauth = getOAuthClient()
  if (!oauth) return redirect({ gc_error: 'config' })

  try {
    const { tokens } = await oauth.getToken(code)
    // Recheck revocation after exchanging the external code.
    const liveSession = await MobileSessions.exists({ _id: payload.sessionId, userId: payload.userId, tenantId: payload.tenantId, revokedAt: null, expiresAt: { $gt: new Date() } })
    if (!liveSession) return redirect({ gc_error: 'state' })
    const user = await Users.findOne(googleImportUserFilter(payload.userId, payload.tenantId))
    if (!user) return redirect({ gc_error: 'user' })
    if (payload.purpose === 'import') {
      const previous = normalizeImportCalendarSettings(user)
      user.googleCalendarImport = {
        ...previous, enabled: true, calendarId: '', calendarName: '',
        refreshToken: tokens.refresh_token || previous.refreshToken || '',
        accessToken: tokens.access_token || previous.accessToken || '',
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : previous.tokenExpiry || null,
        scope: tokens.scope || previous.scope || '', connectedAt: new Date(), email: '',
      }
      await user.save()
      return redirect({ gc_import_connected: '1' })
    }
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
    return redirect({ gc_connected: '1' })
  } catch {
    return redirect({ gc_error: 'exchange' })
  }
}
