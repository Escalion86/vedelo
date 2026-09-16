export const getVisibleTariffFeatureRows = (featureRows, tariffs) => {
  const rows = Array.isArray(featureRows) ? featureRows : []
  const visibleTariffs = Array.isArray(tariffs) ? tariffs : []

  return rows.filter((feature) => {
    if (!feature || typeof feature !== 'object') return false
    if (feature.included || feature.type) return true
    if (!feature.key) return false

    return visibleTariffs.some((tariff) => Boolean(tariff?.[feature.key]))
  })
}
