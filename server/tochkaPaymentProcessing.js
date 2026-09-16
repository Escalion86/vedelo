import crypto from 'crypto'
import Payments from '@models/Payments'
import SiteSettings from '@models/SiteSettings'
import Users from '@models/Users'
import { applyTariffPurchase } from '@server/billing'
import { SBP_BONUS_RATE, getSbpBonusAmount } from '@server/billingConfig'
import { createReferralRewardForBalanceTopup } from '@server/referralRewards'
import {
  TOCHKA_WEBHOOK_JWK,
  extractTochkaPayment,
  getTochkaPayment,
  normalizeAmount,
} from '@server/tochka'
import { recordPaymentSucceeded } from '@server/acquisitionFunnel'

const base64UrlDecode = (value) =>
  Buffer.from(
    String(value || '')
      .replace(/-/g, '+')
      .replace(/_/g, '/'),
    'base64'
  )

const decodeJwtPart = (value) => {
  const text = base64UrlDecode(value).toString('utf8')
  return JSON.parse(text)
}

const getWebhookPublicKey = () => {
  const envJwk = String(process.env.TOCHKA_WEBHOOK_PUBLIC_JWK || '').trim()
  if (envJwk)
    return crypto.createPublicKey({ key: JSON.parse(envJwk), format: 'jwk' })
  return crypto.createPublicKey({ key: TOCHKA_WEBHOOK_JWK, format: 'jwk' })
}

const verifyTochkaWebhookJwt = (jwt) => {
  const parts = String(jwt || '')
    .trim()
    .split('.')
  if (parts.length !== 3) throw new Error('invalid_jwt')

  const header = decodeJwtPart(parts[0])
  if (header?.alg !== 'RS256') throw new Error('unsupported_jwt_alg')

  const signingInput = `${parts[0]}.${parts[1]}`
  const signature = base64UrlDecode(parts[2])
  const verified = crypto.verify(
    'RSA-SHA256',
    Buffer.from(signingInput),
    getWebhookPublicKey(),
    signature
  )
  if (!verified) throw new Error('invalid_jwt_signature')

  return decodeJwtPart(parts[1])
}

const getPaymentMethodInfo = (providerPayment) => {
  const paymentType = String(
    providerPayment?.paymentType || providerPayment?.payment_type || ''
  ).trim()
  if (paymentType === 'sbp') {
    return { type: 'sbp', title: 'СБП', details: {} }
  }
  if (paymentType === 'card') {
    return { type: 'card', title: 'Банковская карта', details: {} }
  }
  return { type: paymentType, title: paymentType, details: {} }
}

const getProviderAmount = (providerPayment) => {
  const value =
    providerPayment?.amount?.value ??
    providerPayment?.amount ??
    providerPayment?.operationAmount
  return normalizeAmount(value)
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

const completeReferralReward = async (payment) => {
  if (!payment.referralRewardPending) return
  try {
    await createReferralRewardForBalanceTopup({
      payment,
      UsersModel: Users,
      PaymentsModel: Payments,
      SiteSettingsModel: SiteSettings,
    })
  } catch (error) {
    logReferralRewardError(payment?._id, error)
  }
}

const processSucceededTochkaPayment = async ({ payment, providerPayment }) => {
  if (payment.status === 'succeeded') {
    await completeReferralReward(payment)
    return { ok: true, alreadyProcessed: true }
  }

  const expected = normalizeAmount(payment.amount)
  const received = getProviderAmount(providerPayment)
  if (expected !== received) {
    payment.status = 'failed'
    payment.rawProviderStatus = providerPayment?.status || ''
    payment.comment = `${payment.comment || 'Платеж'}: сумма платежа не совпала`
    await payment.save()
    return { ok: false, error: 'amount_mismatch' }
  }

  const user = await Users.findById(payment.userId)
  if (!user) {
    payment.status = 'failed'
    payment.rawProviderStatus = providerPayment?.status || ''
    payment.comment = `${payment.comment || 'Платеж'}: пользователь не найден`
    await payment.save()
    return { ok: false, error: 'user_not_found' }
  }

  const lockedPayment = await Payments.findOneAndUpdate(
    { _id: payment._id, status: 'pending' },
    {
      $set: {
        status: 'succeeded',
        rawProviderStatus: providerPayment?.status || '',
      },
    },
    { new: true }
  )
  if (!lockedPayment) {
    const freshPayment = await Payments.findById(payment._id).lean()
    if (freshPayment?.status === 'succeeded') {
      await completeReferralReward(freshPayment)
      return { ok: true, alreadyProcessed: true }
    }
    return {
      ok: false,
      error: 'payment_not_pending',
      status: freshPayment?.status || '',
    }
  }
  payment = lockedPayment

  const methodInfo = getPaymentMethodInfo(providerPayment)
  const bonusAmount =
    payment.purpose === 'balance' && methodInfo.type === 'sbp'
      ? getSbpBonusAmount(payment.amount)
      : 0

  // Баланс может одновременно меняться другим платежом или списанием.
  await Users.updateOne(
    { _id: user._id },
    [
      {
        $set: {
          balance: {
            $add: [
              { $ifNull: ['$balance', 0] },
              Number(payment.amount ?? 0) + bonusAmount,
            ],
          },
        },
      },
    ],
    { updatePipeline: true }
  )

  payment.rawProviderStatus = providerPayment?.status || ''
  payment.paymentMethodType = methodInfo.type
  payment.paymentMethodTitle = methodInfo.title
  payment.paymentMethodDetails = methodInfo.details
  payment.paidAt = providerPayment?.date
    ? new Date(providerPayment.date)
    : new Date()
  payment.referralRewardPending = payment.purpose === 'balance'
  await payment.save()
  recordPaymentSucceeded(payment.userId, payment.paidAt).catch((error) =>
    console.error('[acquisition] tochka payment funnel update failed', {
      paymentId: String(payment._id),
      message: error?.message,
    })
  )

  if (bonusAmount > 0) {
    await Payments.create({
      userId: payment.userId,
      tenantId: payment.tenantId,
      tariffId: null,
      amount: bonusAmount,
      type: 'topup',
      source: 'system',
      status: 'succeeded',
      purpose: 'balance',
      comment: `Бонус 2% за оплату через СБП по платежу ${payment.providerPaymentId}`,
      paymentMethodType: methodInfo.type,
      paymentMethodTitle: methodInfo.title,
    })
  }

  await completeReferralReward(payment)

  if (payment.purpose === 'tariff' && payment.tariffId) {
    const result = await applyTariffPurchase({
      userId: payment.userId,
      tariffId: payment.tariffId,
    })
    if (!result.ok) {
      payment.comment = `${payment.comment || 'Платеж'}: баланс пополнен, но тариф не активирован (${result.error})`
      await payment.save()
      return { ok: false, error: result.error }
    }
  }

  return { ok: true, bonusAmount }
}

const syncTochkaPayment = async ({
  providerPaymentId,
  paymentId,
  providerPayment,
}) => {
  const query = { provider: 'tochka' }
  if (providerPaymentId) query.providerPaymentId = providerPaymentId
  else if (paymentId) query._id = paymentId
  else return { ok: false, error: 'payment_id_required' }

  const payment = await Payments.findOne(query)
  if (!payment) return { ok: false, error: 'payment_not_found' }
  if (!payment.providerPaymentId) {
    return { ok: false, error: 'provider_payment_id_missing' }
  }

  const paymentInfo =
    providerPayment ||
    extractTochkaPayment(await getTochkaPayment(payment.providerPaymentId))
  payment.rawProviderStatus = paymentInfo?.status || ''

  if (paymentInfo?.status === 'APPROVED') {
    return processSucceededTochkaPayment({
      payment,
      providerPayment: paymentInfo,
    })
  }

  if (['EXPIRED', 'REFUNDED'].includes(paymentInfo?.status)) {
    if (payment.status === 'pending') {
      payment.status = 'canceled'
      await payment.save()
    }
    return { ok: true, status: 'canceled' }
  }

  await payment.save()
  return { ok: true, status: paymentInfo?.status || payment.status }
}

export {
  SBP_BONUS_RATE,
  getSbpBonusAmount,
  processSucceededTochkaPayment,
  syncTochkaPayment,
  verifyTochkaWebhookJwt,
}
