import Payments from '@models/Payments'
import SiteSettings from '@models/SiteSettings'
import Users from '@models/Users'
import { applyTariffPurchase } from '@server/billing'
import { SBP_BONUS_RATE, getSbpBonusAmount } from '@server/billingConfig'
import { createReferralRewardForBalanceTopup } from '@server/referralRewards'
import { getYookassaPayment, normalizeAmount } from '@server/yookassa'
import { recordPaymentSucceeded } from '@server/acquisitionFunnel'

const getPaymentMethodInfo = (providerPayment) => {
  const method = providerPayment?.payment_method || {}
  const type = String(method?.type || '').trim()
  if (type === 'bank_card') {
    const card = method?.card || {}
    const cardType = String(card?.card_type || '').trim()
    const last4 = String(card?.last4 || '').trim()
    return {
      type,
      title: [cardType || 'Банковская карта', last4 ? `**** ${last4}` : '']
        .filter(Boolean)
        .join(' '),
      details: {
        first6: card?.first6 || '',
        last4,
        cardType,
        issuerCountry: card?.issuer_country || '',
      },
    }
  }
  if (type === 'sbp') {
    return {
      type,
      title: 'СБП',
      details: {},
    }
  }
  return {
    type,
    title: type || '',
    details: {},
  }
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

const processSucceededYookassaPayment = async ({
  payment,
  providerPayment,
}) => {
  if (payment.status === 'succeeded') {
    await completeReferralReward(payment)
    return { ok: true, alreadyProcessed: true }
  }

  const expected = normalizeAmount(payment.amount)
  const received = String(providerPayment?.amount?.value || '')
  if (expected !== received || providerPayment?.amount?.currency !== 'RUB') {
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
  payment.paidAt = providerPayment?.captured_at
    ? new Date(providerPayment.captured_at)
    : new Date()
  payment.referralRewardPending = payment.purpose === 'balance'
  await payment.save()
  recordPaymentSucceeded(payment.userId, payment.paidAt).catch((error) =>
    console.error('[acquisition] yookassa payment funnel update failed', {
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

const syncYookassaPayment = async ({ providerPaymentId, paymentId }) => {
  const query = {
    provider: 'yookassa',
  }
  if (providerPaymentId) query.providerPaymentId = providerPaymentId
  else if (paymentId) query._id = paymentId
  else return { ok: false, error: 'payment_id_required' }

  const payment = await Payments.findOne(query)
  if (!payment) return { ok: false, error: 'payment_not_found' }
  if (!payment.providerPaymentId) {
    return { ok: false, error: 'provider_payment_id_missing' }
  }

  const providerPayment = await getYookassaPayment(payment.providerPaymentId)
  payment.rawProviderStatus = providerPayment?.status || ''

  if (
    providerPayment?.status === 'succeeded' &&
    providerPayment?.paid === true
  ) {
    return processSucceededYookassaPayment({ payment, providerPayment })
  }

  if (providerPayment?.status === 'canceled') {
    if (payment.status === 'pending') {
      payment.status = 'canceled'
      await payment.save()
    }
    return { ok: true, status: 'canceled' }
  }

  await payment.save()
  return { ok: true, status: providerPayment?.status || payment.status }
}

export {
  SBP_BONUS_RATE,
  getSbpBonusAmount,
  processSucceededYookassaPayment,
  syncYookassaPayment,
}
