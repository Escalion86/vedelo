import mongoose from 'mongoose'

// Global platform offers, managed only by admin/dev. Never tenant-owned CRM data.
const schema = new mongoose.Schema(
  {
    _id: { type: String },
    code: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    tariffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tariffs',
      default: null,
    },
    expiresAt: { type: Date, required: true },
    enabled: { type: Boolean, default: true },
    comment: { type: String, maxlength: 2000, default: '' },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true }
)

export default mongoose.models.PromoCodes ||
  mongoose.model('PromoCodes', schema)
