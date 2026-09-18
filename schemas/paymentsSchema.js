import { Schema } from 'mongoose'

const paymentsSchema = {
  // Actual entry time for backdated manual charges; createdAt is the ledger date.
  recordedAt: { type: Date, default: null },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    default: null,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    required: true,
  },
  tariffId: {
    type: Schema.Types.ObjectId,
    ref: 'Tariffs',
    default: null,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  type: {
    type: String,
    required: true,
    enum: ['topup', 'charge', 'refund'],
  },
  source: {
    type: String,
    required: true,
    enum: ['manual', 'system', 'yookassa', 'tochka'],
  },
  status: {
    type: String,
    default: 'succeeded',
    enum: ['pending', 'succeeded', 'canceled', 'failed'],
  },
  purpose: {
    type: String,
    default: 'balance',
    enum: ['balance', 'tariff', 'system', 'ai'],
  },
  provider: {
    type: String,
    default: '',
  },
  providerPaymentId: {
    type: String,
    default: '',
    trim: true,
    index: true,
  },
  idempotenceKey: {
    type: String,
    default: '',
    trim: true,
  },
  paidAt: {
    type: Date,
    default: null,
  },
  rawProviderStatus: {
    type: String,
    default: '',
  },
  paymentMethodType: {
    type: String,
    default: '',
    trim: true,
  },
  paymentMethodTitle: {
    type: String,
    default: '',
    trim: true,
  },
  paymentMethodDetails: {
    type: Schema.Types.Mixed,
    default: undefined,
  },
  referralReward: {
    type: {
      referralUserId: {
        type: Schema.Types.ObjectId,
        ref: 'Users',
        default: null,
      },
      referrerId: {
        type: Schema.Types.ObjectId,
        ref: 'Users',
        default: null,
      },
      sourcePaymentId: {
        type: Schema.Types.ObjectId,
        ref: 'Payments',
        default: null,
      },
      percent: {
        type: Number,
        default: null,
      },
      rewardFor: {
        type: String,
        enum: ['balance_topup'],
        default: null,
      },
    },
    default: null,
  },
  referralRewardPending: { type: Boolean, default: false },
  comment: {
    type: String,
    default: '',
  },
}

export default paymentsSchema
