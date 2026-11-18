import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  chatId: { type: mongoose.Schema.Types.ObjectId, required: true },
  businessConnectionId: { type: String, required: true },
  telegramChatId: { type: String, required: true },
  runId: { type: String, required: true },
  createDraft: { type: Boolean, default: false },
  armedAt: { type: Date, required: true },
  armedAfterMessageId: { type: Number, default: 0 },
})

schema.index({ tenantId: 1, chatId: 1 }, { unique: true })
schema.index({ tenantId: 1, businessConnectionId: 1, telegramChatId: 1 })

export default mongoose.models.TelegramQuestionnaireTestRuns ||
  mongoose.model('TelegramQuestionnaireTestRuns', schema)
