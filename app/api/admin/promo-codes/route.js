import { NextResponse } from 'next/server'
import getTenantContext from '@server/getTenantContext'
import dbConnect from '@server/dbConnect'
import PromoCodes from '@models/PromoCodes'
import promoCodes from '@server/promoCodes'

const allowed = async () => {
  const { user, tenantId } = await getTenantContext()
  return Boolean(
    tenantId &&
    user?._id &&
    !user.archive &&
    !user.impersonation?.active &&
    ['admin', 'dev'].includes(user.role)
  )
}
const json = (body, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export const GET = async () => {
  if (!(await allowed()))
    return json({ success: false, error: 'Нет доступа' }, 403)
  try {
    await dbConnect()
    return json({
      success: true,
      data: await PromoCodes.find({}).sort({ createdAt: -1 }).lean(),
    })
  } catch {
    return json(
      { success: false, error: 'Не удалось загрузить промокоды' },
      503
    )
  }
}

export const POST = async (req) => {
  if (!(await allowed()))
    return json({ success: false, error: 'Нет доступа' }, 403)
  try {
    await dbConnect()
    const result = await promoCodes.save(await req.json().catch(() => null))
    return json(
      { success: result.ok, data: result.data, error: result.error },
      result.ok ? 200 : result.status
    )
  } catch {
    return json({ success: false, error: 'Не удалось сохранить промокод' }, 503)
  }
}
