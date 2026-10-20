import mongoose from 'mongoose'
import usersSchema from '@schemas/usersSchema'

const UsersSchema = new mongoose.Schema(usersSchema, { timestamps: true })
UsersSchema.index({ phone: 1 }, { unique: true, sparse: true })
UsersSchema.index({ vkId: 1 }, { unique: true, sparse: true })
UsersSchema.index({ yandexId: 1 }, { unique: true, sparse: true })
UsersSchema.index({ tenantId: 1, role: 1 })
UsersSchema.index({ referrerId: 1, createdAt: -1 })
UsersSchema.index({ registrationSource: 1, createdAt: -1 })
UsersSchema.index({ 'acquisition.source': 1, createdAt: -1 })
UsersSchema.index({ 'acquisitionFunnel.activatedAt': 1, createdAt: -1 })

export default mongoose.models.Users || mongoose.model('Users', UsersSchema)
