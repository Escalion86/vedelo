import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ['event', 'task'], default: 'event' },
  containerId: { type: String, default: '' },
  remoteId: { type: String, default: '' },
  marker: { type: String, required: true },
  pendingCreate: { type: Boolean, default: false },
  suppressed: { type: Boolean, default: false },
  lastDone: { type: Boolean, default: false },
  fingerprint: { type: String, default: '' },
  error: { type: String, default: '' },
  lockToken: { type: String, default: '' },
  lockUntil: { type: Date, default: null },
}, { timestamps: true })
schema.index({ tenantId: 1, userId: 1, eventId: 1, taskId: 1 }, { unique: true })
export default mongoose.models.GoogleAdditionalLinks || mongoose.model('GoogleAdditionalLinks', schema)
