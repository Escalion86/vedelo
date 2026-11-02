import mongoose from 'mongoose'
import proposalTemplatesSchema from '@schemas/proposalTemplatesSchema'
import { installCreationTombstoneFilter } from '@helpers/creationTombstone.mjs'

const ProposalTemplatesSchema = new mongoose.Schema(proposalTemplatesSchema, {
  timestamps: true,
})
installCreationTombstoneFilter(ProposalTemplatesSchema)
ProposalTemplatesSchema.index({ tenantId: 1, status: 1, updatedAt: -1 })

export default mongoose.models.ProposalTemplates ||
  mongoose.model('ProposalTemplates', ProposalTemplatesSchema)
