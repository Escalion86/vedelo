const sameId = (left, right) =>
  Boolean(left && right && String(left) === String(right))

export const findAssignedTariff = (tariffs, tariffId) =>
  Array.isArray(tariffs)
    ? tariffs.find((tariff) => sameId(tariff?._id, tariffId)) ?? null
    : null

export const findVisibleFreeTariff = (tariffs) =>
  Array.isArray(tariffs)
    ? tariffs.find(
        (tariff) =>
          tariff?.hidden !== true && Number(tariff?.price ?? 0) <= 0
      ) ?? null
    : null

export const isExpiredRegistrationOffer = (user, now = new Date()) => {
  if (user?.nextChargeAt || !user?.tariffId) return false

  const offer = user?.registrationOffer
  if (!sameId(offer?.tariffId, user.tariffId) || !offer?.endsAt) return false

  const endsAt = new Date(offer.endsAt)
  const currentTime = new Date(now)
  if (
    Number.isNaN(endsAt.getTime()) ||
    Number.isNaN(currentTime.getTime())
  ) {
    return false
  }

  return endsAt.getTime() <= currentTime.getTime()
}
