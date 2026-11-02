import { NextResponse } from 'next/server'

import { getGoogleImportContext } from '@server/googleImportContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { normalizeImportCalendarSettings } from '@server/googleUserCalendarClient'

export const runtime = 'nodejs'

export const GET = async (req) => {
  const { user } = await getGoogleImportContext(req)
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const access = await getUserTariffAccess(user._id)
  const settings = normalizeImportCalendarSettings(user)

  return NextResponse.json({
    success: true,
    data: {
      allowCalendarSync: Boolean(access?.allowCalendarSync),
      allowAi: Boolean(access?.allowAi),
      connected: Boolean(settings.refreshToken),
      enabled: settings.enabled,
      calendarId: settings.calendarId,
      calendarName: settings.calendarName,
      connectedAt: settings.connectedAt,
    },
  })
}
