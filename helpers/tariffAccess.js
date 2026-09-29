export const isTrialActive = (user) => {
  if (!user?.trialEndsAt) return false
  const endsAt = new Date(user.trialEndsAt)
  if (Number.isNaN(endsAt.getTime())) return false
  return endsAt.getTime() > Date.now()
}

const getRegistrationOfferState = (user) => {
  const offer = user?.registrationOffer
  if (!offer?.tariffId || !offer?.endsAt) {
    return { applies: false, active: false, expired: false }
  }
  const applies = String(offer.tariffId) === String(user?.tariffId ?? '')
  const endsAt = new Date(offer.endsAt)
  const validDate = !Number.isNaN(endsAt.getTime())
  const active = applies && validDate && endsAt.getTime() > Date.now()
  const replacedByPaidPeriod = Boolean(user?.nextChargeAt)
  return {
    applies,
    active,
    expired: applies && validDate && !active && !replacedByPaidPeriod,
  }
}

export const isRegistrationOfferTariff = (user) => {
  const state = getRegistrationOfferState(user)
  return state.applies && !user?.nextChargeAt
}

export const isProposalTariffEnabled = (tariff) =>
  Boolean(tariff?.allowProposals ?? tariff?.allowDocuments)

export const getUserTariffAccess = (user, tariffs = []) => {
  const trialActive = isTrialActive(user)
  const registrationOffer = getRegistrationOfferState(user)
  const unrestrictedTrialActive = trialActive && !registrationOffer.applies
  const tariffId = user?.tariffId ? String(user.tariffId) : null
  const tariff =
    tariffId && Array.isArray(tariffs)
      ? tariffs.find((item) => String(item?._id) === tariffId)
      : null
  const hasTariff = Boolean(tariff) && !registrationOffer.expired

  return {
    trialActive,
    registrationOfferActive: registrationOffer.active,
    tariff,
    hasTariff,
    allowCalendarSync:
      unrestrictedTrialActive ||
      (hasTariff && Boolean(tariff?.allowCalendarSync)),
    allowStatistics:
      unrestrictedTrialActive ||
      (hasTariff && Boolean(tariff?.allowStatistics)),
    allowDocuments:
      unrestrictedTrialActive ||
      (hasTariff && Boolean(tariff?.allowDocuments)),
    allowClientReviews: hasTariff && tariff?.allowClientReviews === true,
    allowProposals: hasTariff && isProposalTariffEnabled(tariff),
    allowTelephony: hasTariff && Boolean(tariff?.allowTelephony),
    allowAi: hasTariff && Boolean(tariff?.allowAi),
    allowAvitoIntegration:
      unrestrictedTrialActive ||
      (hasTariff && Boolean(tariff?.allowAvitoIntegration)),
    allowVkIntegration:
      unrestrictedTrialActive ||
      (hasTariff && Boolean(tariff?.allowVkIntegration)),
    allowTelegramIntegration:
      hasTariff && Boolean(tariff?.allowTelegramIntegration),
    allowPublicLeadApi: hasTariff && Boolean(tariff?.allowPublicLeadApi),
    eventsPerMonth: unrestrictedTrialActive
      ? Infinity
      : hasTariff
        ? Number(tariff?.eventsPerMonth ?? 0)
        : 0,
  }
}
