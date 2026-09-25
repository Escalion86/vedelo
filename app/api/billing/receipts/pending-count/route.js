import { NextResponse } from 'next/server'
import Payments from '@models/Payments'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { buildMissingPaymentReceiptFilter } from '@server/paymentHistory'

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

  await dbConnect()
  const count = await Payments.countDocuments(
    buildMissingPaymentReceiptFilter()
  )
  return NextResponse.json({ success: true, data: { count } })
}
