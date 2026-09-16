import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import Users from '@models/Users'
import Tariffs from '@models/Tariffs'
import Payments from '@models/Payments'
import SiteSettings from '@models/SiteSettings'
import { retryPendingReferralRewards } from '@server/referralRewards'
import getTenantContext from '@server/getTenantContext'

const addMonths = (date, count) => {
  const next = new Date(date)
  const day = next.getDate()
  next.setMonth(next.getMonth() + count)
  if (next.getDate() < day) {
    next.setDate(0)
  }
  return next
}

const canRun = async (req) => {
  const secret = process.env.BILLING_CRON_SECRET || ''
  const headerToken = req.headers.get('x-cron-secret') || ''
  const url = new URL(req.url)
  const queryToken = url.searchParams.get('token') || ''

  if (secret && (headerToken === secret || queryToken === secret)) {
    return { ok: true, user: null }
  }

  const { user } = await getTenantContext()
  if (user && ['dev', 'admin'].includes(user.role)) {
    return { ok: true, user }
  }

  return { ok: false }
}

export const POST = async (req) => {
  const access = await canRun(req)
  if (!access.ok) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }

  await dbConnect()

  const referrals = await retryPendingReferralRewards({
    UsersModel: Users,
    PaymentsModel: Payments,
    SiteSettingsModel: SiteSettings,
  })

  const now = new Date()
  const dueUsers = await Users.find({
    tariffId: { $ne: null },
    nextChargeAt: { $lte: now },
    billingStatus: { $ne: 'cancelled' },
  }).lean()

  const tariffs = await Tariffs.find({ hidden: { $ne: true } }).lean()
  const freeTariff =
    tariffs.find((item) => Number(item?.price ?? 0) <= 0) ?? null

  let processed = 0
  let renewed = 0
  let movedToFree = 0
  let skipped = 0

  for (const user of dueUsers) {
    processed += 1
    if (!user?.tariffId) {
      skipped += 1
      continue
    }
    const tariff = tariffs.find(
      (item) => String(item?._id) === String(user.tariffId)
    )
    if (!tariff) {
      skipped += 1
      continue
    }
    const price = Number(tariff.price ?? 0)
    if (!Number.isFinite(price) || price <= 0) {
      await Users.findByIdAndUpdate(user._id, {
        tariffActiveUntil: null,
        nextChargeAt: null,
        billingStatus: 'active',
      })
      skipped += 1
      continue
    }

    const balance = Number(user.balance ?? 0)
    if (!Number.isFinite(balance) || balance < price) {
      if (freeTariff) {
        await Users.findByIdAndUpdate(user._id, {
          tariffId: freeTariff._id,
          tariffActiveUntil: null,
          nextChargeAt: null,
          billingStatus: 'debt',
        })
        movedToFree += 1
      } else {
        await Users.findByIdAndUpdate(user._id, {
          billingStatus: 'debt',
        })
      }
      continue
    }

    const baseDate =
      user.tariffActiveUntil && new Date(user.tariffActiveUntil) > now
        ? new Date(user.tariffActiveUntil)
        : now
    const nextChargeAt = addMonths(baseDate, 1)

    await Users.findByIdAndUpdate(user._id, {
      balance: balance - price,
      tariffActiveUntil: nextChargeAt,
      nextChargeAt,
      billingStatus: 'active',
    })

    await Payments.create({
      userId: user._id,
      tenantId: user.tenantId ?? user._id,
      tariffId: tariff._id,
      amount: price,
      type: 'charge',
      source: 'system',
      comment: `Продление тарифа "${tariff.title}"`,
    })

    renewed += 1
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        processed,
        renewed,
        movedToFree,
        skipped,
        referrals,
      },
    },
    { status: 200 }
  )
}
