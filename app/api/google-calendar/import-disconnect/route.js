import { NextResponse } from 'next/server'

import Users from '@models/Users'
import { getGoogleImportContext, googleImportUserFilter } from '@server/googleImportContext'

export const runtime = 'nodejs'

export const POST = async (req) => {
  const { user, tenantId } = await getGoogleImportContext(req)
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  await Users.updateOne(googleImportUserFilter(user._id, tenantId), { $set: { googleCalendarImport: {
    enabled: false,
    calendarId: '',
    calendarName: '',
    refreshToken: '',
    accessToken: '',
    tokenExpiry: null,
    scope: '',
    connectedAt: null,
    email: '',
  } } })

  return NextResponse.json({ success: true })
}
