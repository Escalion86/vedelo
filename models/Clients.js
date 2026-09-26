import mongoose from 'mongoose'
import clientsSchema from '@schemas/clientsSchema'

const ClientsSchema = new mongoose.Schema(clientsSchema, { timestamps: true })
ClientsSchema.add({
  webCreateFingerprint: { type: String, select: false, immutable: true },
})
ClientsSchema.index({ tenantId: 1, phone: 1 })
ClientsSchema.index({ tenantId: 1, vk: 1 })
ClientsSchema.index({ tenantId: 1, telegramUserId: 1 })
ClientsSchema.index({ tenantId: 1, createdAt: -1 })
ClientsSchema.index({ tenantId: 1, firstName: 1, lastName: 1 })

export default mongoose.models.Clients ||
  mongoose.model('Clients', ClientsSchema)
