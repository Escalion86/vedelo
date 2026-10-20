import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
  eventSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  serviceNames: { type: mongoose.Schema.Types.Mixed, default: {} },
  clientName: { type: String, default: '' },
  steps: { type: [mongoose.Schema.Types.Mixed], required: true },
  completed: { type: [Number], default: [] },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, minimize: false })
schema.index({ tenantId: 1, userId: 1, createdAt: -1 })

export default mongoose.models.AiEditPlans || mongoose.model('AiEditPlans', schema)
