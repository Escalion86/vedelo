import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import PushDeliveryLogs from '@models/PushDeliveryLogs'
import { toPushDeliveryLogDto } from '@helpers/pushDeliveryPresentation.mjs'

const normalizeLimit = (value) => {
  const limit = Number(value)
  if (!Number.isFinite(limit)) return 20
  return Math.min(Math.max(Math.trunc(limit), 1), 100)
}

export const GET = async (req) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const url = new URL(req.url)
  const limit = normalizeLimit(url.searchParams.get('limit'))

  await dbConnect()
  const logs = await PushDeliveryLogs.find({ tenantId, eventType: 'summary' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()

  return NextResponse.json(
    {
      success: true,
      data: logs.map(toPushDeliveryLogDto),
    },
    { status: 200 }
  )
}
