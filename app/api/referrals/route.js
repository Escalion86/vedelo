import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Payments from '@models/Payments'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import {
  buildAdminReferralGroups,
  buildReferralRows,
} from '@server/referralSummary'
import { REFERRAL_REWARD_FOR_BALANCE_TOPUP } from '@server/referralRewards'

const toObjectId = (value) => {
  const stringValue = value ? String(value) : ''
  return mongoose.Types.ObjectId.isValid(stringValue)
    ? new mongoose.Types.ObjectId(stringValue)
    : null
}

const userSelect =
  '_id firstName secondName thirdName registrationType createdAt referrerId'

const rewardQueryByReferrer = (referrerId) => ({
  status: 'succeeded',
  'referralReward.referrerId': referrerId,
  'referralReward.rewardFor': REFERRAL_REWARD_FOR_BALANCE_TOPUP,
})

export const GET = async (req) => {
  const { user } = await getRequestContext(req)
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') || 'mine'

  await dbConnect()

  if (scope === 'admin') {
    if (user?.role !== 'dev') {
      return NextResponse.json(
        { success: false, error: 'Нет доступа' },
        { status: 403 }
      )
    }

    const referrals = await Users.find({ referrerId: { $ne: null } })
      .select(userSelect)
      .lean()
    const referrerIds = Array.from(
      new Set(referrals.map((item) => String(item.referrerId)).filter(Boolean))
    )
      .map(toObjectId)
      .filter(Boolean)

    const [referrers, rewardPayments] = await Promise.all([
      referrerIds.length > 0
        ? Users.find({ _id: { $in: referrerIds } })
            .select(userSelect)
            .lean()
        : Promise.resolve([]),
      referrerIds.length > 0
        ? Payments.find({
            status: 'succeeded',
            'referralReward.referrerId': { $in: referrerIds },
            'referralReward.rewardFor': REFERRAL_REWARD_FOR_BALANCE_TOPUP,
          })
            .select('amount createdAt updatedAt paidAt referralReward')
            .lean()
        : Promise.resolve([]),
    ])

    return NextResponse.json(
      {
        success: true,
        data: {
          groups: buildAdminReferralGroups({
            referrers,
            referrals,
            rewardPayments,
          }),
        },
      },
      { status: 200 }
    )
  }

  const userId = toObjectId(user?._id)
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Некорректный пользователь' },
      { status: 400 }
    )
  }

  const [referrals, rewardPayments] = await Promise.all([
    Users.find({ referrerId: userId }).select(userSelect).lean(),
    Payments.find(rewardQueryByReferrer(userId))
      .select('amount createdAt updatedAt paidAt referralReward')
      .lean(),
  ])

  const rows = buildReferralRows({ referrals, rewardPayments })

  return NextResponse.json(
    {
      success: true,
      data: {
        referrals: rows,
        referralsCount: rows.length,
        rewardsTotal: rows.reduce(
          (total, row) => total + Number(row.rewardsTotal ?? 0),
          0
        ),
        rewardsCount: rows.reduce(
          (total, row) => total + Number(row.rewardsCount ?? 0),
          0
        ),
      },
    },
    { status: 200 }
  )
}
