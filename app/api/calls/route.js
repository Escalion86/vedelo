import { NextResponse } from 'next/server'
import Calls from '@models/Calls'
import dbConnect from '@server/dbConnect'
import { normalizeCallInput, normalizeCallStatus } from '@server/calls'
import { requireTelephonyTariffAccess } from '@server/telephonyAccess'

const parsePositiveInt = (value, fallback) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), 200)
}

export const GET = async (req) => {
  const access = await requireTelephonyTariffAccess(req)
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    )
  }
  const { tenantId } = access

  await dbConnect()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const limit = parsePositiveInt(searchParams.get('limit'), 80)
  const query = { tenantId, provider: { $ne: 'android' } }

  if (status && status !== 'all') query.status = normalizeCallStatus(status)

  const calls = await Calls.find(query)
    .sort({ startedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean()

  return NextResponse.json(
    {
      success: true,
      data: calls,
      meta: {
        limit,
        totalCount: calls.length,
      },
    },
    { status: 200 }
  )
}

export const POST = async (req) => {
  const body = await req.json()
  const access = await requireTelephonyTariffAccess(req)
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    )
  }
  const { tenantId } = access

  await dbConnect()
  const payload = await normalizeCallInput(body, tenantId)
  const call = await Calls.create({
    ...payload,
    tenantId,
    status: payload.transcript ? 'ready' : payload.status,
  })

  return NextResponse.json({ success: true, data: call }, { status: 201 })
}
