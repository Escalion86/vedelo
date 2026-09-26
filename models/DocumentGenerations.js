import mongoose from 'mongoose'

// One immutable file per request, including retries after upload/network failure.
const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
    requestId: { type: String, required: true },
    fingerprint: String,
    number: Number,
    template: mongoose.Schema.Types.Mixed,
    variables: mongoose.Schema.Types.Mixed,
    documentDate: String,
    state: { type: String, default: 'preparing' },
  },
  { timestamps: true }
)
schema.index({ tenantId: 1, eventId: 1, requestId: 1 }, { unique: true })
export default mongoose.models.DocumentGenerations ||
  mongoose.model('DocumentGenerations', schema)
