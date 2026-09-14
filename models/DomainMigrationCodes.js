import mongoose from 'mongoose'
import domainMigrationCodesSchema from '@schemas/domainMigrationCodesSchema'

const DomainMigrationCodesSchema = new mongoose.Schema(domainMigrationCodesSchema, {
  timestamps: true,
})

DomainMigrationCodesSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
DomainMigrationCodesSchema.index({ userId: 1, usedAt: 1, createdAt: -1 })

export default mongoose.models.DomainMigrationCodes ||
  mongoose.model('DomainMigrationCodes', DomainMigrationCodesSchema)
