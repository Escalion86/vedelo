import mongoose from 'mongoose'
import aiUsageSchema from '@schemas/aiUsageSchema'

const AiUsageSchema = new mongoose.Schema(aiUsageSchema, { timestamps: true })

AiUsageSchema.index({ tenantId: 1, createdAt: -1 })
AiUsageSchema.index({ tenantId: 1, source: 1, status: 1, createdAt: -1 })
AiUsageSchema.index({ tenantId: 1, coveredByTariff: 1, status: 1, createdAt: -1 })
AiUsageSchema.index({ feature: 1, status: 1, createdAt: -1 })
AiUsageSchema.index({ source: 1, status: 1, createdAt: -1 })
AiUsageSchema.index({ operationId: 1 }, { unique: true })

export default mongoose.models.AiUsage ||
  mongoose.model('AiUsage', AiUsageSchema)
