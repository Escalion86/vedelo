import mongoose from 'mongoose'

const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    enabled: { type: Boolean, default: true },
    readIds: { type: [String], default: [] },
    knownIds: { type: [String], default: [] },
    activeDays: { type: Number, default: 0 },
    lastActiveDay: { type: String, default: '' },
    lastTipDay: { type: Number, default: -3 },
    tipId: { type: String, default: null },
    tipDismissed: { type: Boolean, default: false },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true }
)

schema.index({ tenantId: 1, userId: 1 }, { unique: true })

export default mongoose.models.LearningProgress ||
  mongoose.model('LearningProgress', schema)
