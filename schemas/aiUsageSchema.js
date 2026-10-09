import { Schema } from 'mongoose'

const aiUsageSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    required: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    required: true,
    index: true,
  },
  operationId: {
    type: String,
    required: true,
    trim: true,
  },
  groupId: {
    type: String,
    default: '',
    trim: true,
  },
  feature: {
    type: String,
    required: true,
    enum: [
      'call_transcription',
      'call_analysis',
      'voice_transcription',
      'event_draft',
      'calendar_import',
      'file_analysis',
      'file_import',
    ],
  },
  provider: {
    type: String,
    default: 'aitunnel',
    trim: true,
  },
  model: {
    type: String,
    default: '',
    trim: true,
  },
  source: {
    type: String,
    enum: ['platform', 'user_key'],
    default: 'platform',
  },
  // Запрос оплачивает тариф с включённым ИИ: с баланса пользователя не списывается.
  coveredByTariff: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['reserving', 'reserved', 'settling', 'succeeded', 'failed'],
    default: 'reserving',
    index: true,
  },
  providerCostMicrorubles: {
    type: Number,
    default: 0,
    min: 0,
  },
  reservedKopecks: {
    type: Number,
    default: 0,
    min: 0,
  },
  chargedKopecks: {
    type: Number,
    default: 0,
    min: 0,
  },
  uncoveredKopecks: {
    type: Number,
    default: 0,
    min: 0,
  },
  markupCoefficient: {
    type: Number,
    default: 1,
    min: 1,
  },
  promptTokens: {
    type: Number,
    default: 0,
    min: 0,
  },
  completionTokens: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalTokens: {
    type: Number,
    default: 0,
    min: 0,
  },
  audioSeconds: {
    type: Number,
    default: 0,
    min: 0,
  },
  balanceBefore: {
    type: Number,
    default: null,
  },
  balanceAfter: {
    type: Number,
    default: null,
  },
  errorCode: {
    type: String,
    default: '',
    trim: true,
  },
}

export default aiUsageSchema
