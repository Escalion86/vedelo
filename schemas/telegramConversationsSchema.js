import { Schema } from 'mongoose'

const telegramConversationsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    required: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'Clients',
    default: null,
  },
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Events',
    default: null,
  },
  businessConnectionId: {
    type: String,
    required: true,
  },
  telegramChatId: {
    type: String,
    required: true,
  },
  telegramUserId: {
    type: String,
    default: '',
  },
  telegramUsername: {
    type: String,
    default: '',
  },
  clientName: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'ignored'],
    default: 'open',
  },
  lastMessageText: {
    type: String,
    default: '',
  },
  lastMessageAt: {
    type: Date,
    default: null,
  },
  lastIncomingAt: {
    type: Date,
    default: null,
  },
  questionnaireFirstMessageId: String,
  unreadCount: {
    type: Number,
    default: 0,
  },
  lastPushAt: {
    type: Date,
    default: null,
  },
}

export default telegramConversationsSchema
