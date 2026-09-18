export const ALL_TARIFFS = '__all_tariffs__'
export const NO_TARIFF = '__no_tariff__'

export const getUserTariffBucket = (user, knownTariffIds) => {
  const tariffId = user?.tariffId ? String(user.tariffId) : ''
  return tariffId && knownTariffIds?.has(tariffId) ? tariffId : NO_TARIFF
}

export const matchesUserTariffFilter = (user, tariffFilter, knownTariffIds) =>
  tariffFilter === ALL_TARIFFS ||
  getUserTariffBucket(user, knownTariffIds) === tariffFilter
