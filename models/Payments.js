import mongoose from 'mongoose'
import paymentsSchema from '@schemas/paymentsSchema'

const PaymentsSchema = new mongoose.Schema(paymentsSchema, {
  timestamps: true,
})

PaymentsSchema.index({ tenantId: 1, userId: 1, createdAt: -1 })
PaymentsSchema.index({ provider: 1, providerPaymentId: 1 })
PaymentsSchema.index({ idempotenceKey: 1 })
PaymentsSchema.index(
  { tenantId: 1, userId: 1, idempotenceKey: 1 },
  {
    unique: true,
    name: 'unique_tenant_user_payment_idempotence',
    partialFilterExpression: { idempotenceKey: { $gt: '' } },
  }
)
PaymentsSchema.index(
  {
    'referralReward.sourcePaymentId': 1,
    'referralReward.rewardFor': 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      'referralReward.sourcePaymentId': { $type: 'objectId' },
      'referralReward.rewardFor': 'balance_topup',
    },
  }
)

export default mongoose.models.Payments ||
  mongoose.model('Payments', PaymentsSchema)
