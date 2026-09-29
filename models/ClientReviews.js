import mongoose from 'mongoose'

// Приглашение и единственный ответ хранятся вместе для атомарного приёма отзыва.
const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    nonce: { type: String, required: true, select: false },
    tokenHash: { type: String, required: true, select: false },
    performerName: { type: String, required: true },
    eventDate: Date,
    expiresAt: { type: Date, required: true },
    sentAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String, maxlength: 2000, default: '' },
    readAt: { type: Date, default: null },
    note: { type: String, maxlength: 2000, default: '' },
  },
  { timestamps: true }
)
schema.index({ tenantId: 1, eventId: 1 }, { unique: true })
schema.index({ tenantId: 1, clientId: 1, createdAt: -1 })
schema.index({ tenantId: 1, submittedAt: -1, readAt: 1 })

export default mongoose.models.ClientReviews ||
  mongoose.model('ClientReviews', schema)
