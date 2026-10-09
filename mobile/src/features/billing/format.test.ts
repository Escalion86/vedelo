import {
  formatBalanceRunway,
  formatBillingDate,
  formatRubles,
  getAiTariffLabel,
  getTariffFeatures,
} from './format'

describe('mobile billing format', () => {
  it('форматирует баланс и дату прогноза', () => {
    expect(formatRubles(800)).toContain('800')
    expect(formatBillingDate('2026-10-25T00:00:00.000Z')).toBe('25.10.2026')
    expect(
      formatBalanceRunway({
        account: {
          balance: 800,
          billingStatus: 'active',
          tariffActiveUntil: null,
          nextChargeAt: null,
          fundedMonths: 2,
          fundedUntil: '2026-10-25T00:00:00.000Z',
          unlimited: false,
        },
        currentTariff: null,
        tariffs: [],
      })
    ).toContain('хватит до 25.10.2026')
  })

  it('подписывает включённый в тариф лимит ИИ', () => {
    expect(getAiTariffLabel({ allowAi: true })).toBe('ИИ')
    expect(getAiTariffLabel({ allowAi: true, aiIncludedRubPerMonth: 500 })).toBe(
      'ИИ (включено до 500 ₽/мес)'
    )
    expect(
      getAiTariffLabel({ allowAi: false, aiIncludedRubPerMonth: 500 })
    ).toBe('')
  })

  it('показывает включённый лимит ИИ в возможностях тарифа', () => {
    const features = getTariffFeatures({
      _id: 'pro',
      title: 'Профи',
      price: 990,
      eventsPerMonth: 0,
      allowCalendarSync: false,
      allowStatistics: false,
      allowDocuments: false,
      allowTelephony: false,
      allowAi: true,
      aiIncludedRubPerMonth: 500,
      allowAvitoIntegration: false,
      allowVkIntegration: false,
      allowPublicLeadApi: false,
    })
    expect(features).toEqual(['ИИ (включено до 500 ₽/мес)'])
  })
})
