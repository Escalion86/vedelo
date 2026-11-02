import { Schema } from 'mongoose'

const callsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    default: null,
  },
  provider: {
    type: String,
    default: 'manual',
  },
  providerCallId: {
    type: String,
    default: '',
  },
  direction: {
    type: String,
    enum: ['incoming', 'outgoing', 'unknown'],
    default: 'unknown',
  },
  phone: {
    type: String,
    default: '',
  },
  normalizedPhone: {
    type: String,
    default: '',
  },
  startedAt: {
    type: Date,
    default: null,
  },
  endedAt: {
    type: Date,
    default: null,
  },
  durationSec: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['new', 'processing', 'ready', 'linked', 'ignored', 'failed'],
    default: 'new',
  },
  recordingUrl: {
    type: String,
    default: '',
  },
  recordingStorageKey: {
    type: String,
    default: '',
  },
  recordingExpiresAt: {
    type: Date,
    default: null,
  },
  transcript: {
    type: String,
    default: '',
  },
  aiSummary: {
    type: String,
    default: '',
  },
  aiExtractedFields: {
    type: {
      clientName: { type: String, default: '' },
      eventType: { type: String, default: '' },
      eventDate: { type: Date, default: null },
      dateEnd: { type: Date, default: null },
      eventCity: { type: String, default: '' },
      eventLocation: { type: String, default: '' },
      guestCount: { type: String, default: '' },
      budget: { type: Number, default: null },
      waitDeposit: { type: Boolean, default: false },
      depositDueAt: { type: Date, default: null },
      depositExpectedAmount: { type: Number, default: null },
      serviceTitles: { type: [String], default: [] },
      nextContactAt: { type: Date, default: null },
      nextContactReason: { type: String, default: '' },
      objections: { type: [String], default: [] },
      confidence: { type: Number, default: 0 },
    },
    default: () => ({}),
  },
  linkedClientId: {
    type: Schema.Types.ObjectId,
    ref: 'Clients',
    default: null,
  },
  linkedEventId: {
    type: Schema.Types.ObjectId,
    ref: 'Events',
    default: null,
  },
  eventDecision: {
    type: String,
    enum: ['pending', 'create_event', 'no_event', 'created', 'failed', ''],
    default: '',
  },
  eventDecisionAt: {
    type: Date,
    default: null,
  },
  eventPromptSentAt: {
    type: Date,
    default: null,
  },
  callResult: {
    type: String,
    enum: ['answered', 'no_answer', 'callback', 'follow_up', ''],
    default: '',
  },
  callResultNote: {
    type: String,
    default: '',
  },
  callResultAt: {
    type: Date,
    default: null,
  },
  androidResultOperation: {
    type: {
      fingerprint: { type: String, required: true },
      state: { type: String, enum: ['pending', 'confirmed'], default: 'pending' },
      createdBy: { type: Schema.Types.ObjectId, ref: 'Users' },
      taskId: { type: Schema.Types.ObjectId, default: null },
    },
    default: undefined,
  },
  recordingPushSentAt: {
    type: Date,
    default: null,
  },
  processingError: {
    type: String,
    default: '',
  },
}

export default callsSchema
