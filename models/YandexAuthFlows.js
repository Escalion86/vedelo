import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  hash: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['oauth', 'pending', 'mobile', 'ticket'], required: true },
  verifier: String,
  mobileRedirect: String,
  mobileChallenge: String,
  mobileState: String,
  referrerId: String,
  yandexId: String,
  phone: String,
  userId: mongoose.Schema.Types.ObjectId,
  tenantId: mongoose.Schema.Types.ObjectId,
  yandexUnlinkedAt: Date,
  expiresAt: { type: Date, required: true },
})
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export default mongoose.models.YandexAuthFlows || mongoose.model('YandexAuthFlows', schema)
