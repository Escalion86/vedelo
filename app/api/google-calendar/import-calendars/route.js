import { NextResponse } from 'next/server'

import { getGoogleImportContext } from '@server/googleImportContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  listUserImportCalendars,
  normalizeImportCalendarSettings,
} from '@server/googleUserCalendarClient'

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
  if (!access?.allowCalendarSync || !access?.allowAi) {
    return NextResponse.json(
      { success: false, error: 'Импорт недоступен по тарифу' },
      { status: 403 }
    )
  }

  const settings = normalizeImportCalendarSettings(user)
  if (!settings.refreshToken) {
    return NextResponse.json(
      { success: false, error: 'Аккаунт Google для импорта не подключен' },
      { status: 400 }
    )
  }

  const calendars = await listUserImportCalendars(user)
  return NextResponse.json({
    success: true,
    data: { calendars, selectedId: settings.calendarId || '' },
  })
}
