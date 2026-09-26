export const TRANSACTION_CATEGORY_ALIASES = Object.freeze({
  advance: 'deposit',
  client_payment: 'final_payment',
  colleague_percent: 'referral_in',
})

export const normalizeTransactionCategory = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  return Object.hasOwn(TRANSACTION_CATEGORY_ALIASES, raw)
    ? TRANSACTION_CATEGORY_ALIASES[raw]
    : raw || 'other'
}
