import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
  eventSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  serviceNames: { type: mongoose.Schema.Types.Mixed, default: {} },
  clientName: { type: String, default: '' },
  provider: String,
  model: String,
  steps: { type: [mongoose.Schema.Types.Mixed], required: true },
  completed: { type: [Number], default: [] },
  executionStartedAt: Date,
  expiresAt: { type: Date, required: true },
}, { timestamps: true, minimize: false })
schema.index({ tenantId: 1, userId: 1, createdAt: -1 })
schema.index({ executionStartedAt: 1, expiresAt: 1 })

export default mongoose.models.AiEditPlans || mongoose.model('AiEditPlans', schema)
