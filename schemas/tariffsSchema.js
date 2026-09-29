import { Schema } from 'mongoose'

const tariffsSchema = {
  title: {
    type: String,
    required: [true, 'Укажите название тарифа'],
    trim: true,
  },
  eventsPerMonth: {
    type: Number,
    default: 0,
    min: 0,
  },
  price: {
    type: Number,
    default: 0,
    min: 0,
  },
  allowCalendarSync: {
    type: Boolean,
    default: false,
  },
  allowStatistics: {
    type: Boolean,
    default: false,
  },
  allowDocuments: {
    type: Boolean,
    default: false,
  },
  allowPastRequests: {
    type: Boolean,
    default: false,
  },
  allowProposals: {
    type: Boolean,
    default: undefined,
  },
  allowTelephony: {
    type: Boolean,
    default: false,
  },
  allowAi: {
    type: Boolean,
    default: false,
  },
  allowAvitoIntegration: {
    type: Boolean,
    default: false,
  },
  allowVkIntegration: {
    type: Boolean,
    default: false,
  },
  allowTelegramIntegration: {
    type: Boolean,
    default: false,
  },
  allowPublicLeadApi: {
    type: Boolean,
    default: false,
  },
  hidden: {
    type: Boolean,
    default: false,
  },
}

export default tariffsSchema
