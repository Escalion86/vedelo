export type TariffChangeQuote = {
  current: boolean
  creditAmount: number
  chargeAmount: number
  missingAmount: number
  balanceAfter: number
  blockedReason: string
}

export type MobileTariff = {
  personalOffer?: boolean
  _id: string
  title: string
  price: number
  eventsPerMonth: number
  allowCalendarSync: boolean
  allowStatistics: boolean
  allowDocuments: boolean
  allowClientReviews?: boolean
  allowTelegramIntegration?: boolean
  allowProposals?: boolean
  allowTelephony: boolean
  allowAi: boolean
  aiIncludedRubPerMonth?: number
  allowAvitoIntegration: boolean
  allowVkIntegration: boolean
  allowPublicLeadApi: boolean
  change?: TariffChangeQuote
}

export type MobileBilling = {
  pendingTariffChange?: { tariffId: string; startsAt: string; title: string } | null
  aiIncludedRates?: AiIncludedRates
  account: {
    balance: number
    billingStatus: string
    tariffActiveUntil: string | null
    nextChargeAt: string | null
    fundedMonths: number | null
    fundedUntil: string | null
    unlimited: boolean
  }
  currentTariff: MobileTariff | null
  tariffs: MobileTariff[]
}

export type AiIncludedRates = Partial<{
  transcriptionRubPerSecond: number
  voiceNoteRub: number
  eventDraftRub: number
  fileRecordRub: number
}>
