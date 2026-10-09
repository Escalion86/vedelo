export type TariffChangeQuote = {
  current: boolean
  creditAmount: number
  chargeAmount: number
  missingAmount: number
  balanceAfter: number
  blockedReason: string
}

export type MobileTariff = {
  _id: string
  title: string
  price: number
  eventsPerMonth: number
  allowCalendarSync: boolean
  allowStatistics: boolean
  allowDocuments: boolean
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
