import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  kind: { type: String, enum: ['lock', 'item'], required: true },
  calendarId: String,
  sourceId: String,
  leaseToken: String,
  leaseUntil: Date,
  analysisStarted: { type: Boolean, default: false },
  analysisAttempt: { type: Number, default: 0 },
  analysis: mongoose.Schema.Types.Mixed,
  completed: { type: Boolean, default: false },
  eventId: mongoose.Schema.Types.ObjectId,
}, { timestamps: true })

// Deterministic _id is the unique identity. No TTL: deleting it would allow a
// repeated import of a deleted CRM record and a second paid analysis.
export default mongoose.models.GoogleImportOperations || mongoose.model('GoogleImportOperations', schema)
