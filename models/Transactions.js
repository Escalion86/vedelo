import mongoose from 'mongoose'
import transactionsSchema from '@schemas/transactionsSchema'

const TransactionsSchema = new mongoose.Schema(transactionsSchema, {
  timestamps: true,
})
TransactionsSchema.add({ aiEditReceipts: { type: [String], select: false, default: undefined } })
TransactionsSchema.add({ aiEditPaymentFingerprint: { type: String, select: false, immutable: true } })
TransactionsSchema.index(
  { tenantId: 1, aiEditPaymentFingerprint: 1 },
  { unique: true, partialFilterExpression: { aiEditPaymentFingerprint: { $type: 'string' } } }
)
TransactionsSchema.index({ tenantId: 1, date: -1 })
TransactionsSchema.index({ tenantId: 1, eventId: 1 })
TransactionsSchema.index({ tenantId: 1, clientId: 1 })
TransactionsSchema.index({ tenantId: 1, type: 1 })

export default mongoose.models.Transactions ||
  mongoose.model('Transactions', TransactionsSchema)
