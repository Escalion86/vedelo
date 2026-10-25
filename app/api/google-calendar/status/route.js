import { NextResponse } from 'next/server'

import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { normalizeCalendarSettings } from '@server/googleUserCalendarClient'
import { isGoogleTasksDeveloper, hasGoogleTasksScope } from '@helpers/googleTasksBeta.mjs'

export const runtime = 'nodejs'

export const GET = async () => {
  const { user } = await getTenantContext()
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const access = await getUserTariffAccess(user._id)
  const settings = normalizeCalendarSettings(user)
  const connected = Boolean(settings.refreshToken)

  return NextResponse.json(
    {
      success: true,
      data: {
        allowCalendarSync: Boolean(access?.allowCalendarSync),
        allowAi: Boolean(access?.allowAi),
        connected,
        tasksBeta: isGoogleTasksDeveloper(user) ? {
          ...settings.tasksBeta, available: true, authorized: hasGoogleTasksScope(user),
        } : null,
        enabled: settings.enabled,
        calendarId: settings.calendarId,
        calendarName: settings.calendarName,
        connectedAt: settings.connectedAt,
        reminders: settings.reminders,
        statusColors: settings.statusColors,
        syncSettings: settings.syncSettings,
        deleteCanceledFromCalendar: settings.deleteCanceledFromCalendar,
        skipTransferredFromCalendar: settings.skipTransferredFromCalendar,
      },
    },
    { status: 200 }
  )
}
