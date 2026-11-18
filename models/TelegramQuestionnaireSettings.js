import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  questionnaire: { type: mongoose.Schema.Types.Mixed, required: true },
  revision: { type: Number, default: 0 },
})

export default mongoose.models.TelegramQuestionnaireSettings ||
  mongoose.model('TelegramQuestionnaireSettings', schema)
