import { NextResponse } from 'next/server'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  getTenantReviewPage,
  saveTenantReviewPage,
} from '@server/reviewAppearance'
import { reviewOrigin } from '@server/clientReviews'

const unauthorized = () =>
  NextResponse.json({ success: false, error: 'Не авторизован' }, { status: 401 })

export const GET = async () => {
  const { user, tenantId } = await getTenantContext()
  if (!user?._id || !tenantId) return unauthorized()
  const [access, reviewPage] = await Promise.all([
    getUserTariffAccess(user._id),
    getTenantReviewPage(tenantId),
  ])
  return NextResponse.json({
    success: true,
    data: {
      reviewPage,
      allowClientReviews: Boolean(access?.allowClientReviews),
      origin: reviewOrigin(),
    },
  })
}

export const POST = async (req) => {
  const { user, tenantId } = await getTenantContext()
  if (!user?._id || !tenantId) return unauthorized()
  const access = await getUserTariffAccess(user._id)
  if (!access?.allowClientReviews)
    return NextResponse.json(
      {
        success: false,
        error: 'Публичная страница отзывов доступна на тарифе с отзывами',
      },
      { status: 403 }
    )
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return NextResponse.json(
      { success: false, error: 'Некорректный запрос' },
      { status: 400 }
    )
  const saved = await saveTenantReviewPage(tenantId, body)
  if (saved.error)
    return NextResponse.json({ success: false, error: saved.error }, { status: 400 })
  return NextResponse.json({
    success: true,
    data: {
      reviewPage: saved.appearance,
      allowClientReviews: true,
      origin: reviewOrigin(),
    },
  })
}
