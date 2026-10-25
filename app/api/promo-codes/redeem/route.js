import { NextResponse } from 'next/server'
import getRequestContext from '@server/getRequestContext'
import dbConnect from '@server/dbConnect'
import promoCodes from '@server/promoCodes'
import { checkRateLimit, rateLimitResponse } from '@server/rateLimit'

export const POST = async (req) => {
  try {
    const context = await getRequestContext(req)
    if (!context.user?._id || !context.tenantId || context.user.archive)
      return NextResponse.json(
        { success: false, error: 'Не авторизован' },
        { status: 401 }
      )
    const limit = await checkRateLimit({
      req,
      scope: 'promo-redeem',
      limit: 15,
      windowMs: 60000,
      keyParts: [context.tenantId, context.user._id],
    })
    if (!limit.ok) return rateLimitResponse(NextResponse, limit)
    const body = await req.json().catch(() => null)
    if (!body || Object.keys(body).some((key) => key !== 'code'))
      return NextResponse.json(
        { success: false, error: 'Передайте только промокод' },
        { status: 400 }
      )
    await dbConnect()
    const result = await promoCodes.redeem({ ...context, code: body.code })
    return NextResponse.json(
      { success: result.ok, data: result.data, error: result.error },
      {
        status: result.ok ? 200 : result.status,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          'Не удалось завершить активацию. Повторите тот же промокод для сверки результата',
      },
      { status: 503 }
    )
  }
}
