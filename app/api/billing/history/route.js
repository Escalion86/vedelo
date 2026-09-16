import { NextResponse } from 'next/server'
import Payments from '@models/Payments'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import {
  buildPaymentHistoryFilter,
  makePaymentHistoryCursor,
  parsePaymentHistoryCursor,
  parsePaymentHistoryLimit,
  serializePaymentHistoryAccount,
  serializePaymentHistoryItem,
} from '@server/paymentHistory'

export const GET = async (req) => {
  const context = await getRequestContext(req)
  if (!context?.user?._id || !context?.tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(req.url)
  const limit = parsePaymentHistoryLimit(searchParams.get('limit'))
  const cursor = parsePaymentHistoryCursor(searchParams.get('cursor'))
  const category = String(searchParams.get('category') || 'all')
  const filter = buildPaymentHistoryFilter({
    userId: context.user._id,
    tenantId: context.tenantId,
    category,
    cursor,
  })

  await dbConnect()
  const rows = await Payments.find(filter)
    .select(
      'amount type source status purpose paidAt createdAt comment paymentMethodType paymentMethodTitle referralReward.percent referralReward.rewardFor'
    )
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()

  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]

  return NextResponse.json({
    success: true,
    data: {
      items: items.map(serializePaymentHistoryItem),
      account: serializePaymentHistoryAccount(context.user),
    },
    meta: {
      hasMore,
      nextCursor: hasMore && last ? makePaymentHistoryCursor(last) : null,
    },
  })
}
