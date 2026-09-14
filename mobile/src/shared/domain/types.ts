export type SyncState = 'pending' | 'syncing' | 'conflict' | 'failed' | 'synced'

export type Client = {
  _id: string
  syncVersion?: number
  syncStatus?: SyncState
  firstName?: string
  secondName?: string
  thirdName?: string
  phone?: number | string | null
  whatsapp?: number | string | null
  telegram?: string
  email?: string
  vk?: string
  viber?: number | string | null
  instagram?: string
  preferredContactChannel?:
    | 'phone'
    | 'telegram'
    | 'whatsapp'
    | 'max'
    | 'vk'
    | 'other'
    | ''
  preferredContactChannelOther?: string
  messengerPushMuted?: boolean
  comment?: string
  clientType?: string
  town?: string
  significantDates?: Array<{
    _id?: string
    title?: string
    date?: string
    comment?: string
  }>
  legalName?: string
  inn?: string
  kpp?: string
  ogrn?: string
  bankName?: string
  bik?: string
  checkingAccount?: string
  correspondentAccount?: string
  legalAddress?: string
  documents?: Array<{
    id: string
    type: DocumentTemplate['type']
    customTypeName?: string
    title?: string
    url?: string
    file?: {
      name?: string
      storageKey?: string
      url?: string
      path?: string
      size?: number | null
      contentType?: string
      checksum?: string
    } | null
    createdAt?: string
  }>
  updatedAt?: string
}

export type Event = {
  _id: string
  syncVersion?: number
  syncStatus?: SyncState
  clientId?: string | null
  eventType?: string
  description?: string
  eventDate?: string | null
  dateEnd?: string | null
  status: 'draft' | 'active' | 'canceled' | 'closed'
  contractSum?: number
  isByContract?: boolean
  isTransferred?: boolean
  waitDeposit?: boolean
  depositDueAt?: string | null
  depositExpectedAmount?: number | null
  address?: {
    town?: string
    street?: string
    house?: string
    entrance?: string
    floor?: string
    flat?: string
    comment?: string
    latitude?: string
    longitude?: string
    link2Gis?: string
    linkYandexNavigator?: string
  }
  servicesIds?: string[]
  otherContacts?: Array<{
    clientId?: string | null
    comment?: string
  }>
  additionalEvents?: Array<{
    _id?: string
    title?: string
    description?: string
    date?: string | null
    done?: boolean
    doneAt?: string | null
  }>
  calendarImportChecked?: boolean
  calendarSyncError?: string
  requestCreatedAt?: string
  createdAt?: string
  documents?: Array<{
    id: string
    type: DocumentTemplate['type']
    customTypeName?: string
    title?: string
    url?: string
    file?: {
      name?: string
      storageKey?: string
      url?: string
      path?: string
      size?: number | null
      contentType?: string
      checksum?: string
    } | null
    createdAt?: string
  }>
  documentFiles?: Array<{
    mobileUploadId?: string
    name?: string
    description?: string
    url: string
    size?: number
    type?: string
    uploadedAt?: string
  }>
  updatedAt?: string
}

export type Transaction = {
  _id: string
  syncVersion?: number
  syncStatus?: SyncState
  eventId?: string | null
  clientId?: string | null
  amount: number
  type: 'income' | 'expense'
  category?: string
  date?: string
  comment?: string
  paymentMethod?: 'transfer' | 'account' | 'cash' | 'barter' | 'obligation'
  updatedAt?: string
}

export type Service = {
  _id: string
  syncVersion?: number
  syncStatus?: SyncState
  title?: string
  description?: string
  price?: number
  duration?: number
  groupId?: string | null
  archive?: boolean
  updatedAt?: string
}

export type ServiceGroup = {
  _id: string
  syncVersion?: number
  syncStatus?: SyncState
  title?: string
  order?: number
  updatedAt?: string
}

export type MobileSettings = {
  _id: string
  syncVersion?: number
  towns?: string[]
  defaultTown?: string
  addresses?: Array<Record<string, unknown>>
  timeZone?: string
  custom?: {
    eventTypes?: string[]
    onboardingActivityPreset?: string
    primaryEntityTerminology?: 'auto' | 'events' | 'orders'
    [key: string]: unknown
  }
  updatedAt?: string
}

export type Call = {
  _id: string
  provider?: string
  phone?: string
  linkedClientId?: string | null
  linkedEventId?: string | null
  clientName?: string
  direction?: 'incoming' | 'outgoing' | 'unknown'
  status?: 'new' | 'processing' | 'ready' | 'linked' | 'ignored' | 'failed'
  startedAt?: string | null
  endedAt?: string | null
  durationSec?: number
  transcript?: string
  aiSummary?: string
  aiExtractedFields?: {
    clientName?: string
    eventType?: string
    eventDate?: string | null
    eventCity?: string
    eventLocation?: string
    guestCount?: string
    budget?: number | null
    nextContactAt?: string | null
    nextContactReason?: string
    objections?: string[]
    confidence?: number
  }
  recordingUrl?: string
  recordingExpiresAt?: string | null
  eventDecision?: string
  callResult?: 'answered' | 'no_answer' | 'callback' | 'follow_up' | ''
  callResultNote?: string
  callResultAt?: string | null
  processingError?: string
  createdAt?: string | null
  updatedAt?: string | null
}

export type DocumentTemplate = {
  id: string
  name: string
  type: 'contract' | 'invoice' | 'receipt' | 'act' | 'other'
  customTypeName?: string
  fileName: string
  size?: number
  createdAt?: string
  updatedAt?: string
}

export type ConversationProvider = 'avito' | 'vk'

export type Conversation = {
  _id: string
  provider: ConversationProvider
  clientId?: string | null
  eventId?: string | null
  clientName?: string
  status?: 'open' | 'closed' | 'ignored'
  lastMessageText?: string
  lastMessageAt?: string | null
  unreadCount?: number
  avitoItemTitle?: string
}

export type ConversationMessage = {
  _id: string
  direction: 'incoming' | 'outgoing'
  text?: string
  sentAt?: string | null
  status?: 'received' | 'sent' | 'failed'
  attachments?: unknown[]
}

export const syncStateLabel: Record<SyncState, string> = {
  pending: 'Ожидает отправки',
  syncing: 'Синхронизация',
  conflict: 'Конфликт',
  failed: 'Ошибка',
  synced: 'Синхронизировано',
}
