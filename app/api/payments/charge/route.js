import { NextResponse } from 'next/server'
import getTenantContext from '@server/getTenantContext'
import Users from '@models/Users'
import Payments from '@models/Payments'
import { createManualCharge } from '@server/manualBalanceCharge'

export const POST = async (req) => {
  const context = await getTenantContext()
  const body = await req.json().catch(() => ({}))
  try {
    const result = await createManualCharge({
      context,
      body,
      UsersModel: Users,
      PaymentsModel: Payments,
    })
    return NextResponse.json(
      {
        success: true,
        data: {
          user: { _id: result.user._id, balance: result.user.balance },
          paymentId: result.payment._id,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.status
          ? error.message
          : 'Не удалось выполнить списание. Повторите отправку.',
      },
      { status: error.status || 500 }
    )
  }
}
