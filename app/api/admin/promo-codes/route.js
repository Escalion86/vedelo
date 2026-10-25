import { NextResponse } from 'next/server'
import getTenantContext from '@server/getTenantContext'
import dbConnect from '@server/dbConnect'
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

export const GET = async (req) => {
  if (!(await allowed()))
    return json({ success: false, error: 'Нет доступа' }, 403)
  try {
    await dbConnect()
    const params = new URL(req?.url || 'http://localhost').searchParams
    if (params.has('userId') || params.has('code')) {
      const page = Number(params.get('page') || 0)
      if (!Number.isSafeInteger(page) || page < 0 || page > 100000)
        return json({ success: false, error: 'Некорректная страница' }, 400)
      const result = params.has('userId')
        ? await promoCodes.userHistory(params.get('userId'))
        : await promoCodes.usages(params.get('code'), page)
      return json(
        { success: result.ok, data: result.data, error: result.error },
        result.ok ? 200 : result.status
      )
    }
    return json({
      success: true,
      data: await promoCodes.list(),
    })
  } catch {
    return json(
      { success: false, error: 'Не удалось загрузить промокоды' },
      503
    )
  }
}

export const DELETE = async (req) => {
  if (!(await allowed()))
    return json({ success: false, error: 'Нет доступа' }, 403)
  try {
    await dbConnect()
    const result = await promoCodes.remove(await req.json().catch(() => null))
    return json(
      { success: result.ok, error: result.error },
      result.ok ? 200 : result.status
    )
  } catch {
    return json({ success: false, error: 'Не удалось удалить промокод' }, 503)
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
