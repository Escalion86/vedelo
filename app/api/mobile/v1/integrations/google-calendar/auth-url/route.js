import MobileSessions from '@models/MobileSessions'
import dbConnect from '@server/dbConnect'
import getAuthSecret from '@server/getAuthSecret'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { getOAuthClient, WRITE_SCOPE } from '@server/googleUserCalendarClient'
import {
  createMobileOAuthState,
  hashMobileOAuthState,
} from '@server/mobile/oauthState'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'

const STATE_TTL_MS = 10 * 60 * 1000

export const GET = async (req) => {
  const context = await getRequestContext(req)
  if (
    context.authType !== 'mobile' ||
    !context.user?._id ||
    !context.tenantId ||
    !context.mobileSessionId
  ) {
    return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  }
  const access = await getUserTariffAccess(context.user._id)
  if (!access?.allowCalendarSync) {
    return mobileError('CALENDAR_TARIFF_REQUIRED', 'Синхронизация недоступна по тарифу', 403)
  }
  const oauth = getOAuthClient()
  if (!oauth) {
    return mobileError('GOOGLE_OAUTH_NOT_CONFIGURED', 'Google OAuth не настроен', 503)
  }
  const now = Date.now()
  const requestedScheme = new URL(req.url).searchParams.get('appScheme') || 'vedelo'
  const state = createMobileOAuthState({
    userId: context.user._id,
    tenantId: context.tenantId,
    sessionId: context.mobileSessionId,
    appScheme: requestedScheme,
    secret: getAuthSecret(),
    now,
    ttlMs: STATE_TTL_MS,
  })
  await dbConnect()
  const session = await MobileSessions.findOneAndUpdate(
    {
      _id: context.mobileSessionId,
      userId: context.user._id,
      tenantId: context.tenantId,
      revokedAt: null,
      expiresAt: { $gt: new Date(now) },
    },
    {
      $set: {
        googleOAuthStateHash: hashMobileOAuthState(state),
        googleOAuthStateExpiresAt: new Date(now + STATE_TTL_MS),
      },
    },
    { returnDocument: 'after' }
  ).lean()
  if (!session) return mobileError('SESSION_REVOKED', 'Сессия устройства отозвана', 401)
  const url = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [WRITE_SCOPE],
    state,
  })
  return mobileSuccess({ url })
}
