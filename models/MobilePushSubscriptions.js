import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  installationId: { type: String, required: true },
  revision: { type: Number, required: true },
  deliveryId: { type: String, required: true },
  provider: { type: String, enum: ['expo', 'rustore'], required: true },
  pushToken: { type: String, required: true },
  deviceId: { type: String, default: '' },
  applicationId: { type: String, required: true },
  showDetails: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true })
schema.index({ tenantId: 1, installationId: 1 }, { unique: true })
schema.index({ tenantId: 1, isActive: 1 })
export default mongoose.models.MobilePushSubscriptions || mongoose.model('MobilePushSubscriptions', schema)
