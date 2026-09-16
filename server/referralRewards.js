import { createHash } from 'node:crypto'

export const DEFAULT_REFERRAL_PERCENT = 5
export const REFERRAL_REWARD_FOR_BALANCE_TOPUP = 'balance_topup'

// A stable _id also protects concurrent inserts before the secondary index exists.
export const getReferralRewardId = (sourcePaymentId) =>
  createHash('sha256')
    .update(`vedelo:referral:balance_topup:${sourcePaymentId}`)
    .digest('hex')
    .slice(0, 24)

const readQuery = async (query) => {
  if (!query) return null
  if (typeof query.lean === 'function') return query.lean()
  return query
}

const getId = (value) => (value ? String(value) : '')

const isSameId = (left, right) => getId(left) && getId(left) === getId(right)

export const normalizeReferralPercent = (value) => {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_REFERRAL_PERCENT
  }
  const percent = Number(value)
  if (!Number.isFinite(percent)) return DEFAULT_REFERRAL_PERCENT
  return Math.min(Math.max(percent, 0), 100)
}

export const calculateReferralRewardAmount = ({ amount, percent }) => {
  const normalizedAmount = Number(amount ?? 0)
  const normalizedPercent = normalizeReferralPercent(percent)
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return 0
  if (!Number.isFinite(normalizedPercent) || normalizedPercent <= 0) return 0
  return Math.floor((normalizedAmount * normalizedPercent) / 100)
}

export const getGlobalReferralPercent = async ({ SiteSettingsModel }) => {
  const settings = await readQuery(
    SiteSettingsModel?.findOne({ tenantId: null })
  )
  return normalizeReferralPercent(settings?.referralProgram?.percent)
}

export const createReferralRewardForBalanceTopup = async ({
  payment,
  UsersModel,
  PaymentsModel,
  SiteSettingsModel,
  allowManualReward = false,
}) => {
  const sourcePaymentId = payment?._id
  const isManualRewardAllowed =
    payment?.source !== 'manual' || allowManualReward === true
  const isBalanceTopup =
    payment?.purpose === 'balance' &&
    payment?.type === 'topup' &&
    payment?.source !== 'system' &&
    isManualRewardAllowed

  if (!isBalanceTopup) return { ok: true, skipped: 'not_balance_topup' }
  if (!sourcePaymentId) return { ok: true, skipped: 'missing_source_payment' }
  if (!payment?.userId) return { ok: true, skipped: 'missing_user' }
  if (payment.status !== 'succeeded')
    return { ok: true, skipped: 'payment_not_succeeded' }

  const finish = async (result) => {
    await PaymentsModel.updateOne(
      {
        _id: sourcePaymentId,
        userId: payment.userId,
        tenantId: payment.tenantId,
      },
      { $set: { referralRewardPending: false } }
    )
    return result
  }

  const referredUser = await UsersModel?.findById(payment.userId)
  if (
    referredUser &&
    !isSameId(payment.tenantId, referredUser.tenantId ?? referredUser._id)
  )
    return { ok: false, error: 'payment_tenant_mismatch' }
  const referrerId = referredUser?.referrerId
  if (!referredUser || !referrerId) {
    return finish({ ok: true, skipped: 'missing_referrer' })
  }
  if (isSameId(referredUser._id, referrerId)) {
    return finish({ ok: true, skipped: 'self_referral' })
  }

  const rewardQuery = {
    'referralReward.sourcePaymentId': sourcePaymentId,
    'referralReward.rewardFor': REFERRAL_REWARD_FOR_BALANCE_TOPUP,
  }
  let reward = await PaymentsModel.findOne(rewardQuery)
  if (reward && reward.status !== 'pending') {
    return finish({
      ok: true,
      skipped: 'already_rewarded',
      reward,
    })
  }

  const referrer = await UsersModel.findById(referrerId).select(
    '+referralRewardCredits'
  )
  if (!referrer) return finish({ ok: true, skipped: 'referrer_not_found' })
  const tenantId = referrer.tenantId ?? referrer._id
  const rewardId = getReferralRewardId(sourcePaymentId)
  const creditPath = `referralRewardCredits.${rewardId}`

  if (!reward && referrer.referralRewardCredits?.[rewardId]) {
    // The administrator deleted this reward. Its receipt must outlive the row.
    return finish({ ok: true, skipped: 'already_rewarded' })
  }

  if (!reward) {
    const percent = await getGlobalReferralPercent({ SiteSettingsModel })
    const rewardAmount = calculateReferralRewardAmount({
      amount: payment.amount,
      percent,
    })
    if (rewardAmount <= 0)
      return finish({ ok: true, skipped: 'reward_amount_zero' })
    try {
      reward = await PaymentsModel.create({
        _id: rewardId,
        userId: referrerId,
        tenantId,
        tariffId: referrer.tariffId ?? null,
        amount: rewardAmount,
        type: 'topup',
        source: 'system',
        status: 'pending',
        purpose: 'balance',
        comment: `Реферальное начисление ${percent}% от пополнения пользователя`,
        referralReward: {
          referralUserId: referredUser._id,
          referrerId,
          sourcePaymentId,
          percent,
          rewardFor: REFERRAL_REWARD_FOR_BALANCE_TOPUP,
        },
      })
    } catch (error) {
      if (error?.code !== 11000) throw error
      reward = await PaymentsModel.findOne(rewardQuery)
      if (!reward) throw error
    }
  }

  if (
    !isSameId(reward.userId, referrerId) ||
    !isSameId(reward.tenantId, tenantId)
  )
    throw new Error('referral_reward_owner_mismatch')
  if (reward.status !== 'pending')
    return finish({ ok: true, skipped: 'already_rewarded', reward })

  // Both the money and the receipt change in one document, including standalone MongoDB.
  const credited = await UsersModel.updateOne(
    {
      _id: referrerId,
      tenantId: referrer.tenantId ?? null,
      [creditPath]: { $ne: true },
    },
    { $inc: { balance: reward.amount }, $set: { [creditPath]: true } }
  )
  if (!credited.matchedCount) {
    const receipt = await UsersModel.findOne({
      _id: referrerId,
      tenantId: referrer.tenantId ?? null,
      [creditPath]: true,
    })
    if (!receipt) throw new Error('referral_credit_not_applied')
  }

  await PaymentsModel.updateOne(
    { _id: reward._id, userId: referrerId, tenantId, status: 'pending' },
    { $set: { status: 'succeeded', paidAt: new Date() } }
  )

  return finish({ ok: true, rewardAmount: reward.amount, reward })
}

export const retryPendingReferralRewards = async (models) => {
  const payments = await models.PaymentsModel.find({
    referralRewardPending: true,
    status: 'succeeded',
    type: 'topup',
    purpose: 'balance',
    source: { $in: ['yookassa', 'tochka', 'manual'] },
  })
    .sort({ updatedAt: 1 })
    .limit(100)
  let completed = 0
  let failed = 0
  for (const payment of payments) {
    try {
      const result = await createReferralRewardForBalanceTopup({
        ...models,
        payment,
        allowManualReward: payment.source === 'manual',
      })
      if (result.ok) completed += 1
      else failed += 1
    } catch {
      failed += 1
    }
    // Rotate persistent failures so they cannot starve the next batch.
    await models.PaymentsModel.updateOne(
      {
        _id: payment._id,
        tenantId: payment.tenantId,
        referralRewardPending: true,
      },
      { $set: { updatedAt: new Date() } }
    )
  }
  return { completed, failed }
}
