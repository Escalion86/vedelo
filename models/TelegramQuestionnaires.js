import mongoose from 'mongoose'

const { Schema } = mongoose

const schema = new Schema({
  _id: { type: String, required: true },
  tenantId: { type: Schema.Types.ObjectId, required: true },
  conversationId: { type: Schema.Types.ObjectId, required: true },
  businessConnectionId: { type: String, required: true },
  telegramChatId: { type: String, required: true },
  callbackToken: { type: String, required: true },
  eventId: { type: Schema.Types.ObjectId, required: true },
  step: { type: String, required: true },
  revision: { type: Number, default: 0 },
  questions: { type: Schema.Types.Mixed, default: () => ({}) },
  welcomeText: { type: String, default: '' },
  answers: { type: new Schema({
    service: String,
    date: String,
    city: String,
    details: String,
  }, { _id: false }), default: () => ({}) },
  lastInputMessageId: { type: Number, required: true },
  promptMessageId: { type: Number, default: 0 },
  deliveryToken: { type: String, default: '' },
  deliveryLeaseUntil: { type: Date, default: null },
  mediaAttempted: { type: Boolean, default: false },
  submittedFromMessageId: { type: Number, default: 0 },
  submittedAt: { type: Date, default: null },
}, { timestamps: true })

export default mongoose.models.TelegramQuestionnaires ||
  mongoose.model('TelegramQuestionnaires', schema)
