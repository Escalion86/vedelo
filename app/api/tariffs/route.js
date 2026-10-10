import { NextResponse } from 'next/server'
import Tariffs from '@models/Tariffs'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const canManageTariffs = (user) => ['admin', 'dev'].includes(user?.role)

export const GET = async () => {
  const { user } = await getTenantContext()
  if (!user || !canManageTariffs(user)) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }
  await dbConnect()
  const tariffs = await withAiIncludedEstimates(
    await Tariffs.find({}).sort({ price: 1, title: 1 }).lean()
  )
  return NextResponse.json({ success: true, data: tariffs }, { status: 200 })
}

export const POST = async (req) => {
  const { user } = await getTenantContext()
  if (!user || !canManageTariffs(user)) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }
  const body = await req.json()
  await dbConnect()
  const tariff = await Tariffs.create(body)
  return NextResponse.json({ success: true, data: tariff }, { status: 201 })
}
