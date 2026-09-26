import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import Payments from '@models/Payments'
import { syncYookassaPayment } from '@server/yookassaPaymentProcessing'

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { user, tenantId } = await getTenantContext()
  if (!user?._id || !tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const paymentId = String(body?.paymentId || '').trim()
  if (!mongoose.Types.ObjectId.isValid(paymentId)) {
    return NextResponse.json(
      { success: false, error: paymentId ? 'Некорректный платеж' : 'Не указан платеж' },
      { status: 400 }
    )
  }

  await dbConnect()

  const isAdmin = ['dev', 'admin'].includes(user.role)
  const payment = await Payments.findOne({
    _id: paymentId,
    provider: 'yookassa',
    // Служебные роли сохраняют доступ к платежам пользователей.
    ...(!isAdmin ? { tenantId, userId: user._id } : {}),
  }).lean()
  if (!payment) {
    return NextResponse.json(
      { success: false, error: 'Платеж не найден' },
      { status: 404 }
    )
  }

  const result = await syncYookassaPayment({ paymentId })
  return NextResponse.json({ success: result.ok, data: result }, { status: 200 })
}
