import { NextResponse } from 'next/server'
import SupportTickets from '@models/SupportTickets'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { buildSupportUnreadQuery } from '@server/supportTickets'

export const GET = async (req) => {
  const context = await getRequestContext(req)
  if (!context?.tenantId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Не авторизован' },
      },
      { status: 401 }
    )
  }
  await dbConnect()
  const unreadCount = await SupportTickets.countDocuments(
    buildSupportUnreadQuery(context)
  )
  return NextResponse.json({ success: true, data: { unreadCount } })
}
