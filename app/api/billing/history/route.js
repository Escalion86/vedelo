import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Payments from '@models/Payments'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import {
  buildPaymentHistoryFilter,
  canViewPaymentHistoryForUser,
  makePaymentHistoryCursor,
  parsePaymentHistoryCursor,
  parsePaymentHistoryLimit,
  serializePaymentHistoryAccount,
  serializePaymentHistoryItem,
  paymentManagementActions,
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
  const targetUserId = String(
    searchParams.get('userId') || context.user._id
  ).trim()
  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    return NextResponse.json(
      { success: false, error: 'Некорректный пользователь' },
      { status: 400 }
    )
  }
  if (
    !canViewPaymentHistoryForUser({
      viewerUserId: context.user._id,
      viewerRole: context.user.role,
      targetUserId,
    })
  ) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }

  const limit = parsePaymentHistoryLimit(searchParams.get('limit'))
  const cursor = parsePaymentHistoryCursor(searchParams.get('cursor'))
  const category = String(searchParams.get('category') || 'all')
  await dbConnect()
  const isSelf = String(context.user._id) === targetUserId
  const targetUser = isSelf
    ? context.user
    : await Users.findById(targetUserId)
        .select(
          '_id tenantId balance billingStatus tariffId tariffActiveUntil nextChargeAt'
        )
        .lean()
  if (!targetUser) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const targetTenantId = String(targetUser.tenantId || targetUser._id)
  const filter = buildPaymentHistoryFilter({
    userId: targetUser._id,
    tenantId: targetTenantId,
    category,
    cursor,
  })

  const rows = await Payments.find(filter)
    .select(
      'amount type source status purpose tariffId paidAt createdAt comment receiptUrl receiptNotRequired paymentMethodType paymentMethodTitle referralReward.percent referralReward.rewardFor referralRewardPending'
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
      items: items.map((item) => ({
        ...serializePaymentHistoryItem(item),
        ...(['admin', 'dev'].includes(context.user.role)
          ? { management: paymentManagementActions(item) }
          : {}),
      })),
      account: serializePaymentHistoryAccount(targetUser),
    },
    meta: {
      hasMore,
      nextCursor: hasMore && last ? makePaymentHistoryCursor(last) : null,
    },
  })
}
