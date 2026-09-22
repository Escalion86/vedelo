import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import getRequestContext from '@server/getRequestContext'
import dbConnect from '@server/dbConnect'
import Users from '@models/Users'
import Payments from '@models/Payments'
import Tariffs from '@models/Tariffs'
import {
  analyticsAccessStatus,
  analyticsRange,
  paymentCategoryExpression,
  receiptFilter,
  summarizeAnalytics,
} from '@server/serviceAnalytics.mjs'

export const dynamic = 'force-dynamic'
const respond = (body, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })

export async function GET(req) {
  const context = await getRequestContext(req)
  const status = analyticsAccessStatus(context)
  if (status !== 200)
    return respond(
      { error: status === 401 ? 'Не авторизован' : 'Нет доступа' },
      status
    )
  const now = new Date()
  let range
  try {
    range = analyticsRange(new URL(req.url).searchParams, now)
  } catch (error) {
    return respond({ error: error.message }, 400)
  }
  try {
    await dbConnect()
    // Explicit developer-only cross-tenant report, like billing/operations.
    // Recheck the DB role rather than trusting a stale session claim.
    const actor = await Users.findById(context.user._id).select('role').lean()
    if (actor?.role !== 'dev') return respond({ error: 'Нет доступа' }, 403)
    const excluded = range.excluded.map((id) => new mongoose.Types.ObjectId(id))
    const paymentBase = {
      userId: { $nin: excluded },
      referralRewardPending: { $ne: true },
      amount: { $gt: 0 },
    }
    const occurredAt = { $ifNull: ['$paidAt', '$createdAt'] }
    const [users, tariffs, firstPayments, groups] = await Promise.all([
      Users.find({})
        .select(
          'firstName secondName role createdAt registrationSource acquisition.source acquisition.campaign acquisitionFunnel tariffId tariffActiveUntil trialEndsAt'
        )
        .lean(),
      Tariffs.find({}).select('title').lean(),
      Payments.aggregate([
        { $match: { ...paymentBase, ...receiptFilter } },
        { $group: { _id: '$userId', at: { $min: occurredAt } } },
      ]).option({ maxTimeMS: 15000 }),
      Payments.aggregate([
        { $match: paymentBase },
        { $set: { occurredAt } },
        {
          $match: {
            $or: [
              { occurredAt: { $gte: range.from, $lt: range.end } },
              {
                occurredAt: {
                  $gte: range.previousStart,
                  $lt: range.previousEnd,
                },
              },
            ],
          },
        },
        {
          $group: {
            _id: {
              userId: '$userId',
              category: paymentCategoryExpression,
              status: '$status',
              day: {
                $dateToString: {
                  date: '$occurredAt',
                  format: '%Y-%m-%d',
                  timezone: 'UTC',
                },
              },
              period: {
                $cond: [
                  { $gte: ['$occurredAt', range.from] },
                  'current',
                  'previous',
                ],
              },
            },
            amount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]).option({ maxTimeMS: 15000 }),
    ])
    return respond({
      success: true,
      data: summarizeAnalytics({
        users,
        tariffs,
        firstPayments,
        groups,
        range,
        now,
      }),
      meta: {
        generatedAt: now,
        from: range.from,
        to: range.to,
        end: range.end,
        previousStart: range.previousStart,
        previousEnd: range.previousEnd,
        timezone: 'UTC',
      },
    })
  } catch {
    return respond(
      {
        error:
          'Не удалось загрузить аналитику. Повторите запрос или сократите период.',
      },
      503
    )
  }
}
