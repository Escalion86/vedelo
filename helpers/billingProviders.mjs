const WEB_BILLING_PROVIDERS = Object.freeze({
  tochka: Object.freeze({
    id: 'tochka',
    paymentButtonLabel: 'Оплатить через Точку',
  }),
  yookassa: Object.freeze({
    id: 'yookassa',
    paymentButtonLabel: 'Оплатить через ЮKassa',
  }),
})

export const PRIMARY_WEB_BILLING_PROVIDER = WEB_BILLING_PROVIDERS.tochka

export const getVisibleWebBillingProviders = ({ isDeveloper = false } = {}) =>
  isDeveloper
    ? [WEB_BILLING_PROVIDERS.tochka, WEB_BILLING_PROVIDERS.yookassa]
    : [WEB_BILLING_PROVIDERS.tochka]
