import { Schema } from 'mongoose'

const pushSubscriptionsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    required: true,
    index: true,
  },
  endpoint: {
    type: String,
    required: true,
    trim: true,
  },
  keys: {
    type: {
      p256dh: { type: String, default: '' },
      auth: { type: String, default: '' },
    },
    default: () => ({ p256dh: '', auth: '' }),
  },
  userAgent: {
    type: String,
    default: '',
  },
  webAppOrigin: {
    type: String,
    enum: ['artistcrm', 'vedelo'],
    default: 'artistcrm',
    index: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastSentAt: {
    type: Date,
    default: null,
  },
  migrationNoticeSentAt: {
    type: Date,
    default: null,
  },
}

export default pushSubscriptionsSchema
