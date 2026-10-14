import { NextResponse } from 'next/server'
import {
  getTenantReviewPage,
  saveTenantReviewPage,
} from '@server/reviewAppearance'
import { reviewOrigin, reviewContext, reviewHeaders } from '@server/clientReviews'

const contextError = (response) => NextResponse.json(
  {
    success: false,
    error: response.status === 401
      ? 'Не авторизован'
      : 'Публичная страница отзывов доступна на тарифе с отзывами',
  },
  { status: response.status, headers: reviewHeaders }
)

export const GET = async (req) => {
  const ctx = await reviewContext(false, req)
  if (ctx.response) return contextError(ctx.response)
  const { tenantId, access } = ctx
  const reviewPage = await getTenantReviewPage(tenantId)
  return NextResponse.json({
    success: true,
    data: {
      reviewPage,
      allowClientReviews: Boolean(access?.allowClientReviews),
      origin: reviewOrigin(),
    },
  }, { headers: reviewHeaders })
}

export const POST = async (req) => {
  const ctx = await reviewContext(true, req)
  if (ctx.response) return contextError(ctx.response)
  const { tenantId } = ctx
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return NextResponse.json(
      { success: false, error: 'Некорректный запрос' },
      { status: 400, headers: reviewHeaders }
    )
  const saved = await saveTenantReviewPage(tenantId, body)
  if (saved.error)
    return NextResponse.json({ success: false, error: saved.error }, { status: 400, headers: reviewHeaders })
  return NextResponse.json({
    success: true,
    data: {
      reviewPage: saved.appearance,
      allowClientReviews: true,
      origin: reviewOrigin(),
    },
  }, { headers: reviewHeaders })
}
