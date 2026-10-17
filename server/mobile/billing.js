import {
  calculateBalanceRunway,
  calculateTariffChangeQuote,
} from '../billingCalculations.js'
import { isProposalTariffEnabled } from '../../helpers/tariffAccess.js'

const serializeTariff = (tariff, quote = null) => ({
  _id: String(tariff._id),
  title: String(tariff.title || 'Тариф'),
  personalOffer: Boolean(tariff.hidden),
  price: Math.max(Number(tariff.price ?? 0), 0),
  eventsPerMonth: Math.max(Number(tariff.eventsPerMonth ?? 0), 0),
  allowCalendarSync: Boolean(tariff.allowCalendarSync),
  allowStatistics: Boolean(tariff.allowStatistics),
  allowDocuments: Boolean(tariff.allowDocuments),
  allowProposals: isProposalTariffEnabled(tariff),
  allowClientReviews: tariff.allowClientReviews === true,
  allowTelephony: Boolean(tariff.allowTelephony),
  allowAi: Boolean(tariff.allowAi),
  aiIncludedRubPerMonth: Math.max(Number(tariff.aiIncludedRubPerMonth ?? 0), 0),
  allowAvitoIntegration: Boolean(tariff.allowAvitoIntegration),
  allowVkIntegration: Boolean(tariff.allowVkIntegration),
  allowTelegramIntegration: Boolean(tariff.allowTelegramIntegration),
  allowPublicLeadApi: Boolean(tariff.allowPublicLeadApi),
  ...(quote ? { change: quote } : {}),
})

export const serializeMobileBilling = ({
  user,
  currentTariff,
  tariffs,
  now = new Date(),
  aiIncludedRates,
}) => {
  const balance = Math.max(Number(user?.balance ?? 0), 0)
  const runway = calculateBalanceRunway({
    balance,
    tariffPrice: currentTariff?.price,
    tariffActiveUntil: user?.tariffActiveUntil,
    now,
  })
  return {
    ...(aiIncludedRates ? { aiIncludedRates: serializeMobileAiIncludedRates(aiIncludedRates) } : {}),
    pendingTariffChange: user?.pendingTariffChange ? {
      tariffId: String(user.pendingTariffChange.tariffId),
      startsAt: user.pendingTariffChange.startsAt,
      title: tariffs.find((tariff) => String(tariff._id) === String(user.pendingTariffChange.tariffId))?.title || 'Тариф недоступен',
    } : null,
    account: {
      balance,
      billingStatus: user?.billingStatus || 'active',
      tariffActiveUntil: user?.tariffActiveUntil || null,
      nextChargeAt: user?.nextChargeAt || null,
      ...runway,
    },
    currentTariff: currentTariff ? serializeTariff(currentTariff) : null,
    tariffs: tariffs.map((tariff) =>
      serializeTariff(
        tariff,
        calculateTariffChangeQuote({
          balance,
          currentTariff,
          tariffActiveUntil: user?.tariffActiveUntil,
          targetTariff: tariff,
          now,
        })
      )
    ),
  }
}

// Only public aggregated costs; never usage rows, identities or provider metadata.
export const serializeMobileAiIncludedRates = (rates = {}) =>
  Object.fromEntries(
    ['transcriptionRubPerSecond', 'voiceNoteRub', 'eventDraftRub', 'fileRecordRub']
      .filter((key) => Number.isFinite(rates[key]) && rates[key] >= 0)
      .map((key) => [key, rates[key]])
  )
