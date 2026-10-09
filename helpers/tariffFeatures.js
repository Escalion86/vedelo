export const TARIFF_FEATURES = Object.freeze([
  { key: 'allowCalendarSync', label: 'Синхронизация с Google Calendar' },
  { key: 'allowStatistics', label: 'Расширенная статистика' },
  { key: 'allowDocuments', label: 'Документы и шаблоны' },
  { key: 'allowClientReviews', label: 'Отзывы клиентов' },
  { key: 'allowProposals', label: 'Коммерческие предложения' },
  { key: 'allowTelephony', label: 'Телефония' },
  { key: 'allowAi', label: 'ИИ-функции' },
  { key: 'allowAvitoIntegration', label: 'Интеграция с Avito' },
  { key: 'allowVkIntegration', label: 'Интеграция с VK' },
  { key: 'allowTelegramIntegration', label: 'Интеграция с Telegram' },
  { key: 'allowPublicLeadApi', label: 'API входящих заявок' },
])

// Лимит себестоимости ИИ, который тариф берёт на себя (₽/мес). 0 — не включено.
export const getAiIncludedRubPerMonth = (tariff) => {
  const value = Number(tariff?.aiIncludedRubPerMonth ?? 0)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value * 100) / 100
}

export const formatAiIncludedRubles = (value) => {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return '0 ₽'
  return `${amount.toLocaleString('ru-RU')} ₽`
}

export const getAiFeatureLabel = (tariff, baseLabel = 'ИИ-функции') => {
  const includedRub = getAiIncludedRubPerMonth(tariff)
  if (!includedRub) return baseLabel
  return `${baseLabel} (включено до ${formatAiIncludedRubles(includedRub)} в месяц)`
}

export const getTariffFeatureKeys = (tariff) =>
  TARIFF_FEATURES.filter(({ key }) => Boolean(tariff?.[key])).map(
    ({ key }) => key
  )

export const getTariffFeatureLabels = (tariff, terms = { pluralGenitive: 'заказов' }) => {
  const labels = TARIFF_FEATURES.filter(({ key }) => Boolean(tariff?.[key])).map(
    ({ key, label }) =>
      key === 'allowAi' ? getAiFeatureLabel(tariff, label) : label
  )
  const eventsPerMonth = Number(tariff?.eventsPerMonth ?? 0)
  if (eventsPerMonth > 0) {
    labels.unshift(`До ${eventsPerMonth} ${terms.pluralGenitive} в месяц`)
  }
  return labels
}
