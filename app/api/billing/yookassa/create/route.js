import { NextResponse } from 'next/server'
import crypto from 'crypto'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import Payments from '@models/Payments'
import Tariffs from '@models/Tariffs'
import Users from '@models/Users'
import {
  createYookassaPayment,
  isYookassaConfigured,
  normalizeAmount,
} from '@server/yookassa'
import { resolveTrustedRequestOrigin } from '@server/trustedOrigin'

const MIN_TOPUP_AMOUNT = 100
const MAX_TOPUP_AMOUNT = 300000

const resolveReturnUrl = (req) => {
  const origin = resolveTrustedRequestOrigin(req)
  return `${origin.replace(/\/$/, '')}/cabinet/tariff-select?payment=yookassa`
}

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { user } = await getTenantContext()
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  if (!isYookassaConfigured()) {
    return NextResponse.json(
      { success: false, error: 'ЮKassa не настроена' },
      { status: 503 }
    )
  }

  await dbConnect()

  const dbUser = await Users.findById(user._id)
  if (!dbUser) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const purpose = body?.purpose === 'tariff' ? 'tariff' : 'balance'
  let tariff = null
  let amount = Number(body?.amount ?? 0)
  let description = 'Пополнение баланса Ведело'

  if (purpose === 'tariff') {
    tariff = await Tariffs.findById(body?.tariffId).lean()
    if (!tariff || tariff.hidden) {
      return NextResponse.json(
        { success: false, error: 'Тариф не найден' },
        { status: 404 }
      )
    }
    amount = Number(tariff.price ?? 0)
    description = `Оплата тарифа ${tariff.title}`
  }

  if (!Number.isFinite(amount) || amount < MIN_TOPUP_AMOUNT || amount > MAX_TOPUP_AMOUNT) {
    return NextResponse.json(
      {
        success: false,
        error: `Сумма должна быть от ${MIN_TOPUP_AMOUNT} до ${MAX_TOPUP_AMOUNT} руб.`,
      },
      { status: 400 }
    )
  }

  const idempotenceKey = crypto.randomUUID()
  const payment = await Payments.create({
    userId: dbUser._id,
    tenantId: dbUser.tenantId ?? dbUser._id,
    tariffId: tariff?._id ?? null,
    amount,
    type: 'topup',
    source: 'yookassa',
    status: 'pending',
    purpose,
    provider: 'yookassa',
    idempotenceKey,
    comment: description,
  })

  try {
    const yookassaPayment = await createYookassaPayment({
      amount,
      description,
      idempotenceKey,
      returnUrl: resolveReturnUrl(req),
      user: dbUser,
      metadata: {
        paymentId: String(payment._id),
        userId: String(dbUser._id),
        tenantId: String(dbUser.tenantId ?? dbUser._id),
        purpose,
        tariffId: tariff?._id ? String(tariff._id) : '',
      },
    })

    payment.providerPaymentId = yookassaPayment.id || ''
    payment.rawProviderStatus = yookassaPayment.status || ''
    await payment.save()

    return NextResponse.json(
      {
        success: true,
        data: {
          paymentId: String(payment._id),
          providerPaymentId: yookassaPayment.id,
          status: yookassaPayment.status,
          amount: normalizeAmount(amount),
          confirmationUrl: yookassaPayment?.confirmation?.confirmation_url || '',
        },
      },
      { status: 201 }
    )
  } catch (error) {
    payment.status = 'failed'
    payment.rawProviderStatus = 'create_failed'
    payment.comment = `${description}. Ошибка создания платежа: ${error?.message || 'ЮKassa'}`
    await payment.save()
    return NextResponse.json(
      { success: false, error: error?.message || 'Не удалось создать платеж' },
      { status: 502 }
    )
  }
}
