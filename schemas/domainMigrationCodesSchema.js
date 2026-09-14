import { Schema } from 'mongoose'

const domainMigrationCodesSchema = {
  codeHash: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'Users', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Users', required: true, index: true },
  sourceOrigin: { type: String, enum: ['artistcrm'], required: true },
  targetOrigin: { type: String, enum: ['vedelo'], required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  legacyPushEndpoint: { type: String, default: '' },
  legacyPushDisabledAt: { type: Date, default: null },
}

export default domainMigrationCodesSchema
