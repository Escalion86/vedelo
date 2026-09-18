import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import Users from '@models/Users'
import Payments from '@models/Payments'
import SiteSettings from '@models/SiteSettings'
import {
  createReferralRewardForBalanceTopup,
  getReferralRewardId,
} from '@server/referralRewards'
import { supportsMongoTransactions } from '@server/mongoCapabilities'
import mongoose from 'mongoose'

const sanitizeUser = (user) => {
  if (!user) return null
  const data = typeof user.toObject === 'function' ? user.toObject() : user
  const { password, ...rest } = data
  return rest
}

const logReferralRewardError = (paymentId, error) => {
  console.error('[referralRewards] failed to create reward', {
    paymentId: paymentId ? String(paymentId) : null,
    error: {
      name: error?.name,
      message: error?.message,
    },
  })
}

const withSession = (query, session) =>
  session ? query.session(session) : query

export const GET = async (req) => {
  const { user, tenantId } = await getTenantContext()
  if (!user || !tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Не указан пользователь' },
      { status: 400 }
    )
  }

  const isAdmin = ['dev', 'admin'].includes(user?.role)
  const isSelf = String(user?._id) === String(userId)
  if (!isAdmin && !isSelf) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }

  await dbConnect()

  const query = isAdmin ? { userId } : { userId, tenantId }
  const payments = await Payments.find(query).sort({ createdAt: -1 }).lean()
  return NextResponse.json({ success: true, data: payments }, { status: 200 })
}

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { user, tenantId } = await getTenantContext()
  if (!user || !tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  if (!['dev', 'admin'].includes(user?.role)) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }

  const amount = Number(body.amount ?? 0)
  if (
    typeof body.userId !== 'string' ||
    !mongoose.Types.ObjectId.isValid(body.userId)
  ) {
    return NextResponse.json(
      { success: false, error: 'Не указан пользователь' },
      { status: 400 }
    )
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { success: false, error: 'Некорректная сумма' },
      { status: 400 }
    )
  }

  await dbConnect()

  const userToUpdate = await Users.findById(body.userId)
  if (!userToUpdate) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const updatedUser = await Users.findOneAndUpdate(
    { _id: userToUpdate._id, tenantId: userToUpdate.tenantId ?? null },
    { $inc: { balance: amount } },
    { returnDocument: 'after' }
  )

  const payment = await Payments.create({
    userId: userToUpdate._id,
    tenantId: userToUpdate.tenantId || userToUpdate._id,
    tariffId: userToUpdate.tariffId ?? null,
    amount,
    type: 'topup',
    source: 'manual',
    purpose: 'balance',
    referralRewardPending: body.rewardReferrer === true,
    comment: body.comment ?? '',
  })

  try {
    await createReferralRewardForBalanceTopup({
      payment,
      UsersModel: Users,
      PaymentsModel: Payments,
      SiteSettingsModel: SiteSettings,
      allowManualReward: body.rewardReferrer === true,
    })
  } catch (error) {
    logReferralRewardError(payment?._id, error)
  }

  return NextResponse.json(
    { success: true, data: { user: sanitizeUser(updatedUser), payment } },
    { status: 201 }
  )
}

export const DELETE = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { user, tenantId } = await getTenantContext()
  if (!user || !tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  if (!['dev', 'admin'].includes(user?.role)) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }
  if (
    typeof body.paymentId !== 'string' ||
    !mongoose.Types.ObjectId.isValid(body.paymentId)
  ) {
    return NextResponse.json(
      { success: false, error: 'Некорректная операция' },
      { status: 400 }
    )
  }

  await dbConnect()
  const canUseTransactions = supportsMongoTransactions(mongoose.connection)
  const session = canUseTransactions ? await mongoose.startSession() : null
  let updatedUsers = []

  const deletePayment = async () => {
    updatedUsers = []
    const payment = await withSession(
      Payments.findById(body.paymentId),
      session
    )
    if (!payment) {
      const error = new Error('Операция не найдена')
      error.status = 404
      throw error
    }

    const isManualCharge =
      payment.type === 'charge' &&
      payment.source === 'manual' &&
      payment.status === 'succeeded'
    const isManualTopup =
      payment.type === 'topup' &&
      payment.source === 'manual' &&
      payment.purpose === 'balance' &&
      payment.status === 'succeeded'
    const isReferralReward =
      payment.type === 'topup' &&
      payment.source === 'system' &&
      payment.referralReward?.rewardFor === 'balance_topup'

    if (!isManualTopup && !isReferralReward && !isManualCharge) {
      const error = new Error(
        'Можно удалять только ручные пополнения, ручные списания и реферальные бонусы'
      )
      error.status = 400
      throw error
    }

    const linkedReward = isManualTopup
      ? await withSession(
          Payments.findOne({
            'referralReward.sourcePaymentId': payment._id,
            'referralReward.rewardFor': 'balance_topup',
          }),
          session
        )
      : null
    const paymentsToDelete = [payment, linkedReward].filter(Boolean)
    if (
      paymentsToDelete.some(
        (item) => item.status !== 'succeeded' || item.referralRewardPending
      )
    ) {
      const error = new Error(
        'Начисление бонуса ещё не завершено. Повторите после обработки платежа.'
      )
      error.status = 409
      throw error
    }
    const balanceUpdates = []
    for (const item of paymentsToDelete) {
      const balanceUser = await withSession(
        Users.findById(item.userId).select('+paymentReversals'),
        session
      )
      if (
        !balanceUser ||
        String(item.tenantId) !==
          String(balanceUser.tenantId || balanceUser._id)
      ) {
        const error = new Error('Пользователь операции не найден')
        error.status = 404
        throw error
      }
      const amount =
        (item.type === 'charge' ? -1 : 1) * Number(item.amount ?? 0)
      if (balanceUser.paymentReversals?.[String(item._id)]) continue
      if (amount > 0 && Number(balanceUser.balance ?? 0) < amount) {
        const error = new Error(
          'Недостаточно средств для отката пополнения или связанного бонуса'
        )
        error.status = 409
        throw error
      }
      balanceUpdates.push({ balanceUser, amount, item })
    }

    for (const {
      balanceUser,
      amount,
      item: reversedPayment,
    } of balanceUpdates) {
      const reversalKey = `paymentReversals.${reversedPayment._id}`
      const receipts = { [reversalKey]: true }
      for (const item of paymentsToDelete) {
        if (
          String(item.userId) === String(balanceUser._id) &&
          item.referralReward?.sourcePaymentId
        ) {
          receipts[
            `referralRewardCredits.${getReferralRewardId(item.referralReward.sourcePaymentId)}`
          ] = true
        }
      }
      const updated = await withSession(
        Users.findOneAndUpdate(
          {
            _id: balanceUser._id,
            tenantId: balanceUser.tenantId ?? null,
            ...(amount > 0 ? { balance: { $gte: amount } } : {}),
            [reversalKey]: { $ne: true },
          },
          {
            $inc: { balance: -amount },
            ...(Object.keys(receipts).length ? { $set: receipts } : {}),
          },
          { returnDocument: 'after' }
        ),
        session
      )
      if (!updated) {
        const alreadyReversed = await withSession(
          Users.exists({
            _id: balanceUser._id,
            tenantId: balanceUser.tenantId ?? null,
            [reversalKey]: true,
          }),
          session
        )
        if (alreadyReversed) continue
        const error = new Error(
          'Баланс изменился. Повторите удаление операции.'
        )
        error.status = 409
        throw error
      }
      updatedUsers.push(sanitizeUser(updated))
    }

    await withSession(
      Payments.deleteMany({
        $or: paymentsToDelete.map((item) => ({
          _id: item._id,
          userId: item.userId,
          tenantId: item.tenantId,
        })),
      }),
      session
    )
  }

  try {
    if (session) await session.withTransaction(deletePayment)
    else await deletePayment()
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.status
          ? error.message
          : 'Не удалось удалить операцию. Повторите попытку.',
      },
      { status: error?.status || 500 }
    )
  } finally {
    if (session) await session.endSession()
  }

  return NextResponse.json(
    { success: true, data: { users: updatedUsers } },
    { status: 200 }
  )
}
