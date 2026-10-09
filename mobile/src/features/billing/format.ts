import type { MobileBilling } from './types'

export const formatRubles = (value: number) =>
  `${Math.max(Number(value || 0), 0).toLocaleString('ru-RU')} ₽`

export const formatBillingDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU')
}

export const formatBalanceRunway = (billing?: MobileBilling | null) => {
  if (!billing) return 'Баланс: данные загружаются'
  const balance = formatRubles(billing.account.balance)
  if (billing.account.unlimited) return `Баланс: ${balance} (тариф бесплатный)`
  const fundedUntil = formatBillingDate(billing.account.fundedUntil)
  return fundedUntil
    ? `Баланс: ${balance} (хватит до ${fundedUntil})`
    : `Баланс: ${balance}`
}

export const getAiTariffLabel = (tariff: {
  allowAi?: boolean
  aiIncludedRubPerMonth?: number
}) => {
  if (!tariff?.allowAi) return ''
  const included = Math.max(Number(tariff.aiIncludedRubPerMonth || 0), 0)
  return included > 0
    ? `ИИ (включено до ${formatRubles(included)}/мес)`
    : 'ИИ'
}

export const getTariffFeatures = (tariff: MobileBilling['tariffs'][number]) =>
  [
    tariff.allowCalendarSync && 'Календарь',
    tariff.allowStatistics && 'Статистика',
    tariff.allowDocuments && 'Документы',
    (tariff.allowProposals ?? tariff.allowDocuments) && 'Коммерческие предложения',
    tariff.allowTelephony && 'Телефония',
    getAiTariffLabel(tariff),
    tariff.allowAvitoIntegration && 'Avito',
    tariff.allowVkIntegration && 'VK',
    tariff.allowPublicLeadApi && 'API заявок',
  ].filter(Boolean) as string[]
