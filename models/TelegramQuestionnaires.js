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
  schemaVersion: Number,
  blocks: { type: [Schema.Types.Mixed], default: undefined },
  scenarioMedia: { type: [Schema.Types.Mixed], default: undefined },
  mediaBlockIds: { type: [String], default: undefined },
  blockId: String,
  blockInput: String,
  blockAnswers: { type: [Schema.Types.Mixed], default: undefined },
  aiQuestion: String,
  aiOperation: String,
  aiCalls: Number,
  aiClarifications: { type: [Schema.Types.Mixed], default: undefined },
  aiEditQuestions: { type: [String], default: undefined },
  aiEditing: Boolean,
  initialMessage: String,
  processedCallback: Schema.Types.Mixed,
  testRunId: String,
  createTestDraft: Boolean,
  testResult: Schema.Types.Mixed,
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

schema.index({ tenantId: 1, testRunId: 1 }, { partialFilterExpression: { testRunId: { $type: 'string' } } })
schema.index({ tenantId: 1, businessConnectionId: 1, telegramChatId: 1 })

export default mongoose.models.TelegramQuestionnaires ||
  mongoose.model('TelegramQuestionnaires', schema)
