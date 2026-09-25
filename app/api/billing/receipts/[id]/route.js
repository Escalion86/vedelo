import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Payments from '@models/Payments'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import {
  canAttachPaymentReceipt,
  buildPaymentReceiptFilter,
  normalizePaymentReceiptUrl,
} from '@server/paymentHistory'

export const PATCH = async (req, { params }) => {
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

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (
    !mongoose.Types.ObjectId.isValid(id) ||
    !mongoose.Types.ObjectId.isValid(body.userId)
  ) {
    return NextResponse.json(
      { success: false, error: 'Некорректная операция' },
      { status: 400 }
    )
  }
  const receiptUrl = normalizePaymentReceiptUrl(body.receiptUrl)
  if (receiptUrl === null) {
    return NextResponse.json(
      { success: false, error: 'Укажите ссылку на чек по HTTPS' },
      { status: 400 }
    )
  }

  await dbConnect()
  const targetUser = await Users.findById(body.userId)
    .select('_id tenantId')
    .lean()
  if (!targetUser) {
    return NextResponse.json(
      { success: false, error: 'Операция не найдена' },
      { status: 404 }
    )
  }
  const filter = buildPaymentReceiptFilter({ paymentId: id, user: targetUser })
  const payment = await Payments.findOne(filter)
    .select('type purpose source status')
    .lean()
  if (!payment) {
    return NextResponse.json(
      { success: false, error: 'Операция не найдена' },
      { status: 404 }
    )
  }
  if (!canAttachPaymentReceipt(payment)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Чек можно добавить только к проведённому пополнению баланса',
      },
      { status: 409 }
    )
  }

  const updated = await Payments.findOneAndUpdate(
    {
      ...filter,
      type: 'topup',
      purpose: 'balance',
      status: 'succeeded',
      source: { $in: ['manual', 'tochka', 'yookassa'] },
    },
    { $set: { receiptUrl } },
    { returnDocument: 'after', runValidators: true }
  )
    .select('receiptUrl')
    .lean()
  if (!updated) {
    return NextResponse.json(
      { success: false, error: 'Статус операции изменился. Обновите историю.' },
      { status: 409 }
    )
  }

  return NextResponse.json({
    success: true,
    data: { receiptUrl: updated.receiptUrl },
  })
}
