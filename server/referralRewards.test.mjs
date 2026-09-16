import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_REFERRAL_PERCENT,
  calculateReferralRewardAmount,
  createReferralRewardForBalanceTopup,
  normalizeReferralPercent,
} from './referralRewards.js'

const createQuery = (value) => ({
  select() {
    return this
  },
  then(resolve, reject) {
    return Promise.resolve(value).then(resolve, reject)
  },
  lean: async () => value,
})

const createUserModel = (users) => ({
  findById: (id) =>
    createQuery(users.find((user) => String(user._id) === String(id)) ?? null),
  findOne: async (query) =>
    users.find(
      (user) =>
        user._id === query._id &&
        Object.entries(query).every(
          ([key, value]) =>
            !key.startsWith('referralRewardCredits.') ||
            user.referralRewardCredits?.[key.split('.')[1]] === value
        )
    ) ?? null,
  updateOne: async (query, update) => {
    const user = users.find((item) => String(item._id) === String(query._id))
    if (!user || (user.tenantId ?? null) !== query.tenantId)
      return { matchedCount: 0 }
    const key = Object.keys(query)
      .find((key) => key.startsWith('referralRewardCredits.'))
      ?.split('.')[1]
    if (key && user.referralRewardCredits?.[key]) return { matchedCount: 0 }
    user.balance = Number(user.balance ?? 0) + Number(update.$inc.balance)
    user.referralRewardCredits = { ...user.referralRewardCredits, [key]: true }
    return { matchedCount: 1 }
  },
})

const createPaymentsModel = (payments) => ({
  updateOne: async (query, update) => {
    const payment = payments.find((item) => item._id === query._id)
    if (payment) Object.assign(payment, update.$set)
    return { matchedCount: payment ? 1 : 0 }
  },
  findOne: async (query) => {
    const sourcePaymentId = query?.['referralReward.sourcePaymentId']
    const rewardFor = query?.['referralReward.rewardFor']
    return (
      payments.find(
        (payment) =>
          String(payment?.referralReward?.sourcePaymentId ?? '') ===
            String(sourcePaymentId ?? '') &&
          payment?.referralReward?.rewardFor === rewardFor
      ) ?? null
    )
  },
  create: async (payload) => {
    const payment = {
      _id: `reward-${payments.length + 1}`,
      ...payload,
    }
    payments.push(payment)
    return payment
  },
})

const createSiteSettingsModel = (settings) => ({
  findOne: () => createQuery(settings),
})

test('normalizeReferralPercent falls back to default percent for empty values', () => {
  assert.equal(DEFAULT_REFERRAL_PERCENT, 5)
  assert.equal(normalizeReferralPercent(undefined), 5)
  assert.equal(normalizeReferralPercent(null), 5)
  assert.equal(normalizeReferralPercent(''), 5)
})

test('calculateReferralRewardAmount floors reward from topup amount and percent', () => {
  assert.equal(calculateReferralRewardAmount({ amount: 999, percent: 5 }), 49)
  assert.equal(calculateReferralRewardAmount({ amount: 1000, percent: 7 }), 70)
})

test('createReferralRewardForBalanceTopup ignores non-positive percent', async () => {
  const payments = []
  const referrer = { _id: 'referrer-1', balance: 100 }
  const referred = { _id: 'user-1', referrerId: referrer._id, balance: 0 }

  const result = await createReferralRewardForBalanceTopup({
    payment: {
      _id: 'payment-1',
      userId: referred._id,
      tenantId: referred._id,
      amount: 1000,
      status: 'succeeded',
      type: 'topup',
      source: 'manual',
      purpose: 'balance',
    },
    UsersModel: createUserModel([referrer, referred]),
    PaymentsModel: createPaymentsModel(payments),
    SiteSettingsModel: createSiteSettingsModel({
      referralProgram: { percent: 0 },
    }),
    allowManualReward: true,
  })

  assert.deepEqual(result, { ok: true, skipped: 'reward_amount_zero' })
  assert.equal(referrer.balance, 100)
  assert.equal(payments.length, 0)
})

test('createReferralRewardForBalanceTopup credits referrer for provider payment', async () => {
  const payments = []
  const referrer = { _id: 'referrer-1', balance: 100 }
  const referred = { _id: 'user-1', referrerId: referrer._id, balance: 500 }

  const result = await createReferralRewardForBalanceTopup({
    payment: {
      _id: 'payment-1',
      userId: referred._id,
      tenantId: referred._id,
      amount: 1000,
      status: 'succeeded',
      type: 'topup',
      source: 'yookassa',
      purpose: 'balance',
    },
    UsersModel: createUserModel([referrer, referred]),
    PaymentsModel: createPaymentsModel(payments),
    SiteSettingsModel: createSiteSettingsModel({
      referralProgram: { percent: 5 },
    }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.rewardAmount, 50)
  assert.equal(referrer.balance, 150)
  assert.equal(payments.length, 1)
  assert.equal(payments[0].userId, referrer._id)
  assert.equal(payments[0].amount, 50)
  assert.equal(payments[0].source, 'system')
  assert.equal(payments[0].referralReward.referralUserId, referred._id)
  assert.equal(payments[0].referralReward.referrerId, referrer._id)
  assert.equal(payments[0].referralReward.sourcePaymentId, 'payment-1')
  assert.equal(payments[0].referralReward.percent, 5)
  assert.equal(payments[0].referralReward.rewardFor, 'balance_topup')
})

test('createReferralRewardForBalanceTopup is idempotent by source payment id', async () => {
  const referrer = { _id: 'referrer-1', balance: 100 }
  const referred = { _id: 'user-1', referrerId: referrer._id, balance: 500 }
  const payments = [
    {
      _id: 'reward-existing',
      referralReward: {
        sourcePaymentId: 'payment-1',
        rewardFor: 'balance_topup',
      },
    },
  ]

  const result = await createReferralRewardForBalanceTopup({
    payment: {
      _id: 'payment-1',
      userId: referred._id,
      tenantId: referred._id,
      amount: 1000,
      status: 'succeeded',
      type: 'topup',
      source: 'manual',
      purpose: 'balance',
    },
    UsersModel: createUserModel([referrer, referred]),
    PaymentsModel: createPaymentsModel(payments),
    SiteSettingsModel: createSiteSettingsModel({
      referralProgram: { percent: 5 },
    }),
    allowManualReward: true,
  })

  assert.deepEqual(result, {
    ok: true,
    skipped: 'already_rewarded',
    reward: payments[0],
  })
  assert.equal(referrer.balance, 100)
  assert.equal(payments.length, 1)
})

test('createReferralRewardForBalanceTopup treats duplicate reward insert as idempotent', async () => {
  const referrer = { _id: 'referrer-1', balance: 100 }
  const referred = { _id: 'user-1', referrerId: referrer._id, balance: 500 }
  const existingReward = {
    _id: 'reward-existing',
    userId: 'referrer-1',
    tenantId: 'referrer-1',
    status: 'succeeded',
    referralReward: {
      sourcePaymentId: 'payment-1',
      rewardFor: 'balance_topup',
    },
  }
  let findCalls = 0
  const duplicateError = new Error('duplicate key')
  duplicateError.code = 11000

  const result = await createReferralRewardForBalanceTopup({
    payment: {
      _id: 'payment-1',
      userId: referred._id,
      tenantId: referred._id,
      amount: 1000,
      status: 'succeeded',
      type: 'topup',
      source: 'manual',
      purpose: 'balance',
    },
    UsersModel: createUserModel([referrer, referred]),
    PaymentsModel: {
      updateOne: async () => ({}),
      findOne: async () => {
        findCalls += 1
        return findCalls === 1 ? null : existingReward
      },
      create: async () => {
        throw duplicateError
      },
    },
    SiteSettingsModel: createSiteSettingsModel({
      referralProgram: { percent: 5 },
    }),
    allowManualReward: true,
  })

  assert.deepEqual(result, {
    ok: true,
    skipped: 'already_rewarded',
    reward: existingReward,
  })
})

test('createReferralRewardForBalanceTopup ignores non-balance and system payments', async () => {
  const referrer = { _id: 'referrer-1', balance: 100 }
  const referred = { _id: 'user-1', referrerId: referrer._id, balance: 500 }
  const payments = []
  const common = {
    _id: 'payment-1',
    userId: referred._id,
    tenantId: referred._id,
    amount: 1000,
    status: 'succeeded',
    type: 'topup',
    source: 'manual',
    purpose: 'tariff',
  }
  const deps = {
    UsersModel: createUserModel([referrer, referred]),
    PaymentsModel: createPaymentsModel(payments),
    SiteSettingsModel: createSiteSettingsModel({
      referralProgram: { percent: 5 },
    }),
  }

  assert.deepEqual(
    await createReferralRewardForBalanceTopup({ payment: common, ...deps }),
    {
      ok: true,
      skipped: 'not_balance_topup',
    }
  )

  assert.deepEqual(
    await createReferralRewardForBalanceTopup({
      payment: { ...common, purpose: 'balance', source: 'system' },
      ...deps,
    }),
    {
      ok: true,
      skipped: 'not_balance_topup',
    }
  )

  assert.equal(referrer.balance, 100)
  assert.equal(payments.length, 0)
})

test('createReferralRewardForBalanceTopup requires explicit opt-in for manual topup', async () => {
  const referrer = { _id: 'referrer-1', balance: 100 }
  const referred = { _id: 'user-1', referrerId: referrer._id, balance: 500 }
  const payments = []
  const payment = {
    _id: 'payment-1',
    userId: referred._id,
    tenantId: referred._id,
    amount: 1000,
    status: 'succeeded',
    type: 'topup',
    source: 'manual',
    purpose: 'balance',
  }
  const deps = {
    UsersModel: createUserModel([referrer, referred]),
    PaymentsModel: createPaymentsModel(payments),
    SiteSettingsModel: createSiteSettingsModel({
      referralProgram: { percent: 5 },
    }),
  }

  assert.deepEqual(
    await createReferralRewardForBalanceTopup({ payment, ...deps }),
    { ok: true, skipped: 'not_balance_topup' }
  )
  assert.equal(referrer.balance, 100)
  assert.equal(payments.length, 0)

  const result = await createReferralRewardForBalanceTopup({
    payment,
    ...deps,
    allowManualReward: true,
  })
  assert.equal(result.rewardAmount, 50)
  assert.equal(referrer.balance, 150)
  assert.equal(payments.length, 1)
})
