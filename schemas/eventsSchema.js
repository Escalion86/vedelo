import { Schema } from 'mongoose'
import documentSchema from './documentSchema'

const eventsSchema = {
  syncVersion: {
    type: Number,
    default: 1,
  },
  isDemo: {
    type: Boolean,
    default: false,
  },
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    default: null,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'Clients',
    default: null,
  },
  sourceCallId: {
    type: Schema.Types.ObjectId,
    ref: 'Calls',
    default: null,
  },
  description: {
    type: String,
    default: 'Описание мероприятия',
  },
  eventType: {
    type: String,
    default: '',
  },
  requestCreatedAt: {
    type: Date,
    default: () => new Date(),
  },
  additionalEvents: {
    type: [
      {
        title: { type: String, default: '' },
        description: { type: String, default: '' },
        date: { type: Date, default: null },
        done: { type: Boolean, default: false },
        doneAt: { type: Date, default: null },
        googleCalendarEventId: { type: String, default: '' },
      },
    ],
    default: [],
  },
  eventDate: {
    type: Date,
    default: null,
  },
  servicesIds: {
    type: [Schema.Types.ObjectId],
    ref: 'Services',
    default: [],
  },
  dateEnd: {
    type: Date,
    default: null,
  },
  otherContacts: {
    type: [
      {
        clientId: {
          type: Schema.Types.ObjectId,
          ref: 'Clients',
          default: null,
        },
        comment: {
          type: String,
          default: '',
        },
      },
    ],
    default: [],
  },
  invoiceLinks: {
    type: [String],
    default: [],
  },
  receiptLinks: {
    type: [String],
    default: [],
  },
  actLinks: {
    type: [String],
    default: [],
  },
  contractLinks: {
    type: [String],
    default: [],
  },
  documentFiles: {
    type: [
      {
        mobileUploadId: { type: String, default: '' },
        name: { type: String, default: '' },
        description: { type: String, default: '' },
        url: { type: String, default: '' },
        size: { type: Number, default: 0 },
        type: { type: String, default: '' },
        uploadedAt: { type: Date, default: () => new Date() },
      },
    ],
    default: [],
  },
  documents: {
    type: [documentSchema],
    default: [],
  },
  address: {
    type: {
      town: { type: String, default: '' },
      street: { type: String, default: '' },
      house: { type: String, default: '' },
      entrance: { type: String, default: '' },
      floor: { type: String, default: '' },
      flat: { type: String, default: '' },
      comment: { type: String, default: '' },
      latitude: { type: String, default: '' },
      longitude: { type: String, default: '' },
      link2Gis: { type: String, default: '' },
      linkYandexNavigator: { type: String, default: '' },
      link2GisShow: { type: Boolean, default: true },
      linkYandexShow: { type: Boolean, default: true },
    },
    default: () => ({}),
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'canceled', 'closed'],
    default: 'active',
  },
  cancelReason: {
    type: String,
    default: '',
  },
  isTransferred: {
    type: Boolean,
    default: false,
  },
  colleagueId: {
    type: Schema.Types.ObjectId,
    ref: 'Clients',
    default: null,
  },
  images: {
    type: Array,
    default: [],
  },
  showOnSite: {
    type: Boolean,
    default: true,
  },
  tags: {
    type: Array,
    default: [String],
  },
  report: {
    type: String,
    default: '',
  },
  reportImages: {
    type: Array,
    default: [],
  },
  googleCalendarId: {
    type: String,
    default: null,
  },
  googleCalendarCalendarId: {
    type: String,
    default: '',
  },
  importedFromCalendar: {
    type: Boolean,
    default: false,
  },
  importedFromFile: { type: Boolean, default: false },
  fileImportChecked: { type: Boolean, default: false },
  fileImportKey: { type: String },
  fileImportBatchId: { type: String, default: '' },
  fileImportName: { type: String, default: '' },
  fileImportSource: { type: String, default: '' },
  fileImportAiFields: { type: [String], default: [] },
  fileImportWarnings: { type: [String], default: [] },
  calendarImportChecked: {
    type: Boolean,
    default: false,
  },
  calendarImportAiFields: {
    type: [String],
    default: [],
  },
  calendarImportWarnings: {
    type: [String],
    default: [],
  },
  calendarImportBatchId: {
    type: String,
    default: '',
  },
  contractSum: {
    type: Number,
    default: 0,
  },
  waitDeposit: {
    type: Boolean,
    default: false,
  },
  depositDueAt: {
    type: Date,
    default: null,
  },
  depositExpectedAmount: {
    type: Number,
    default: null,
  },
  isByContract: {
    type: Boolean,
    default: false,
  },
  clientData: {
    type: {},
    default: {},
  },
  financeComment: {
    type: String,
    default: '',
  },
  googleCalendarResponse: {
    type: Schema.Types.Mixed,
    default: null,
  },
  calendarSyncError: {
    type: String,
    default: '',
  },
}

export default eventsSchema
