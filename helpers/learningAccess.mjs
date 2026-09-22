import { getUserTariffAccess } from './tariffAccess.js'

export const getLearningAccess = (article, user, tariffs = []) => {
  const feature = article.requiredFeature
  if (!feature || getUserTariffAccess(user, tariffs)[feature]) {
    return { available: true, label: null }
  }
  const publicTariffs = tariffs
    .filter((tariff) => !tariff.hidden && tariff.title?.trim())
    .sort(
      (a, b) =>
        (a.price ?? 0) - (b.price ?? 0) || a.title.localeCompare(b.title, 'ru')
    )
  const first = publicTariffs.find((tariff) => tariff[feature] === true)
  if (!first) {
    return { available: false, label: 'Недоступно на текущем тарифе' }
  }
  // Prices do not necessarily form a feature ladder: a more expensive tariff
  // may omit this feature. Only promise "starting from" when it is true.
  const allHigherInclude = publicTariffs
    .filter((tariff) => (tariff.price ?? 0) >= (first.price ?? 0))
    .every((tariff) => tariff[feature] === true)
  return {
    available: false,
    label: allHigherInclude
      ? `Доступно с тарифа «${first.title}»`
      : `Доступно на тарифе «${first.title}»`,
  }
}
