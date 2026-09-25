export const getVisibleTariffFeatureRows = (featureRows, tariffs) => {
  const rows = Array.isArray(featureRows) ? featureRows : []
  const visibleTariffs = Array.isArray(tariffs) ? tariffs : []

  return rows.filter((feature) => {
    if (!feature || typeof feature !== 'object') return false
    if (feature.included || feature.type) return true
    if (!feature.key) return false

    return visibleTariffs.some((tariff) =>
      isPublicTariffFeatureAvailable(tariff, feature)
    )
  })
}
export const isPublicTariffFeatureAvailable = (tariff, feature) => {
  if (feature?.included) return true
  if (feature?.key === 'allowProposals') {
    return Boolean(tariff?.allowProposals ?? tariff?.allowDocuments)
  }
  return Boolean(feature?.key && tariff?.[feature.key])
}
