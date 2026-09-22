import mongoose from 'mongoose'
import pushDeliveryLogsSchema from '@schemas/pushDeliveryLogsSchema'

const PushDeliveryLogsSchema = new mongoose.Schema(pushDeliveryLogsSchema, {
  timestamps: true,
})

PushDeliveryLogsSchema.index({ tenantId: 1, eventType: 1, createdAt: -1 })

export default mongoose.models.PushDeliveryLogs ||
  mongoose.model('PushDeliveryLogs', PushDeliveryLogsSchema)
