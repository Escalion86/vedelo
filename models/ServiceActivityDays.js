import mongoose from 'mongoose'

// One server-observed cabinet visit per tenant/user/UTC day. No device or PII payload.
const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    day: { type: String, required: true },
    firstSeenAt: { type: Date, required: true },
  },
  { versionKey: false }
)
schema.index({ tenantId: 1, userId: 1, day: 1 }, { unique: true })
schema.index({ day: 1 })
export default mongoose.models.ServiceActivityDays ||
  mongoose.model('ServiceActivityDays', schema)
