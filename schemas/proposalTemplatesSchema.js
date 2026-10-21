import { Schema } from 'mongoose'

const proposalTemplatesSchema = {
  tenantId: { type: Schema.Types.ObjectId, ref: 'Users', required: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  blocks: { type: [Schema.Types.Mixed], default: [] },
  messageTemplate: { type: String, default: '', maxlength: 4000 },
  appearance: { type: Schema.Types.Mixed, default: () => ({ theme: 'classic', logoUrl: '' }) },
  media: { type: [Schema.Types.Mixed], default: [] },
  defaults: { type: Schema.Types.Mixed, default: () => ({}) },
}

export default proposalTemplatesSchema
