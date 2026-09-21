import { NextResponse } from 'next/server'
import Payments from '@models/Payments'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import {
  parsePaymentHistoryLimit,
  serializePaymentHistoryItem,
} from '@server/paymentHistory'
import {
  buildPaymentOperationsFilter,
  getPaymentOperationsSort,
  getPaymentOperationsUserSearchFilter,
  parsePaymentOperationsParams,
  serializePaymentOperationsUser,
} from '@server/paymentOperations'

const parsePage = (value) => {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? Math.min(page, 100000) : 1
}

export const GET = async (req) => {
  const context = await getRequestContext(req)
  if (!context?.user?._id || !context?.tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  if (context.user.role !== 'dev') {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(req.url)
  const params = parsePaymentOperationsParams(searchParams)
  const limit = parsePaymentHistoryLimit(searchParams.get('limit'))
  const page = parsePage(searchParams.get('page'))
  await dbConnect()

  const userSearchFilter = getPaymentOperationsUserSearchFilter(params.search)
  const userIds = userSearchFilter
    ? (await Users.find(userSearchFilter).select('_id').limit(1000).lean()).map(
        (user) => user._id
      )
    : null
  const filter = buildPaymentOperationsFilter({ ...params, userIds })
  const [total, payments] = await Promise.all([
    Payments.countDocuments(filter),
    Payments.find(filter)
      .select(
        'userId amount type source status purpose tariffId paidAt createdAt comment paymentMethodType paymentMethodTitle referralReward.percent referralReward.rewardFor referralRewardPending'
      )
      .sort(getPaymentOperationsSort(params.sort))
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ])

  const users = await Users.find({
    _id: {
      $in: [...new Set(payments.map((payment) => String(payment.userId)))],
    },
  })
    .select('_id firstName secondName thirdName phone email telegram')
    .lean()
  const usersById = new Map(users.map((user) => [String(user._id), user]))

  return NextResponse.json({
    success: true,
    data: payments.map((payment) => ({
      ...serializePaymentHistoryItem(payment),
      user: serializePaymentOperationsUser(
        usersById.get(String(payment.userId))
      ),
    })),
    meta: { page, limit, total, pageCount: Math.ceil(total / limit) },
  })
}
