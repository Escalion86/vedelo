const PAYMENT_HISTORY_CATEGORIES = new Set([
  'all',
  'tariff',
  'topup',
  'bonus',
  'refund',
])

const PAYMENT_STATUSES = new Set(['pending', 'succeeded', 'canceled', 'failed'])

const normalizeText = (value, maxLength = 240) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)

const toId = (value) => (value ? String(value) : '')

export const canViewPaymentHistoryForUser = ({
  viewerUserId,
  viewerRole,
  targetUserId,
}) => {
  const viewerId = toId(viewerUserId)
  const targetId = toId(targetUserId)
  if (!viewerId || !targetId) return false
  if (viewerId === targetId) return true
  return ['dev', 'admin'].includes(viewerRole)
}

const isReferralBonus = (payment) =>
  payment?.referralReward?.rewardFor === 'balance_topup'

const getPaymentKind = (payment) => {
  if (isReferralBonus(payment)) return 'referral_bonus'
  if (payment?.type === 'topup' && payment?.source === 'system') return 'bonus'
  if (payment?.purpose === 'tariff') return 'tariff'
  if (payment?.type === 'refund') return 'refund'
  if (payment?.type === 'charge') return 'charge'
  return 'topup'
}

const getPaymentTitle = (payment, kind) => {
  if (kind === 'referral_bonus') return 'Реферальный бонус'
  if (kind === 'bonus') return 'Бонус на баланс'
  if (kind === 'tariff' && payment?.type === 'charge') {
    return 'Списание за тариф'
  }
  if (kind === 'tariff') return 'Оплата тарифа'
  if (kind === 'refund') return 'Возврат на баланс'
  if (kind === 'charge') return 'Списание с баланса'
  return 'Пополнение баланса'
}

const getPaymentDetails = (payment, kind) => {
  if (kind === 'referral_bonus') {
    const percent = Number(payment?.referralReward?.percent)
    return Number.isFinite(percent) && percent > 0
      ? `Бонус ${percent}% за пополнение приглашённого пользователя.`
      : 'Бонус за пополнение приглашённого пользователя.'
  }
  if (kind === 'bonus' && payment?.paymentMethodType === 'sbp') {
    return 'Дополнительное начисление за оплату через СБП.'
  }
  return normalizeText(payment?.comment)
}

const getSourceTitle = (source) => {
  if (source === 'tochka') return 'Точка'
  if (source === 'yookassa') return 'ЮKassa'
  if (source === 'manual') return 'Ручная операция'
  if (source === 'system') return 'Ведело'
  return ''
}

export const parsePaymentHistoryLimit = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? Math.min(100, Math.max(1, Math.trunc(parsed)))
    : 30
}

export const parsePaymentHistoryCursor = (value) => {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    const createdAt = new Date(parsed?.createdAt)
    const id = normalizeText(parsed?.id, 24)
    if (Number.isNaN(createdAt.getTime()) || !/^[a-f\d]{24}$/i.test(id)) {
      return null
    }
    return { createdAt, id }
  } catch {
    return null
  }
}

export const makePaymentHistoryCursor = (payment) =>
  Buffer.from(
    JSON.stringify({
      createdAt: payment?.createdAt,
      id: toId(payment?._id),
    })
  ).toString('base64url')

export const buildPaymentHistoryFilter = ({
  userId,
  tenantId,
  category = 'all',
  cursor = null,
}) => {
  const filter = {
    userId: toId(userId),
    tenantId: toId(tenantId),
  }
  const normalizedCategory = PAYMENT_HISTORY_CATEGORIES.has(category)
    ? category
    : 'all'

  if (normalizedCategory === 'tariff') filter.purpose = 'tariff'
  if (normalizedCategory === 'topup') {
    filter.type = 'topup'
    filter.purpose = 'balance'
    filter.source = { $ne: 'system' }
  }
  if (normalizedCategory === 'bonus') {
    filter.type = 'topup'
    filter.source = 'system'
  }
  if (normalizedCategory === 'refund') filter.type = 'refund'

  if (cursor) {
    filter.$and = [
      {
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          {
            createdAt: cursor.createdAt,
            _id: { $lt: cursor.id },
          },
        ],
      },
    ]
  }

  return filter
}

export const serializePaymentHistoryItem = (payment) => {
  const kind = getPaymentKind(payment)
  const type = ['topup', 'charge', 'refund'].includes(payment?.type)
    ? payment.type
    : 'topup'
  const status = PAYMENT_STATUSES.has(payment?.status)
    ? payment.status
    : 'succeeded'
  const amount = Number(payment?.amount ?? 0)

  return {
    id: toId(payment?._id),
    amount: Number.isFinite(amount) ? Math.max(amount, 0) : 0,
    direction: type === 'charge' ? 'out' : 'in',
    type,
    kind,
    status,
    title: getPaymentTitle(payment, kind),
    details: getPaymentDetails(payment, kind),
    sourceTitle: getSourceTitle(payment?.source),
    methodTitle: normalizeText(payment?.paymentMethodTitle, 80),
    occurredAt: payment?.paidAt || payment?.createdAt || null,
  }
}

export const serializePaymentHistoryAccount = (user) => ({
  balance: Number.isFinite(Number(user?.balance)) ? Number(user.balance) : 0,
  billingStatus: normalizeText(user?.billingStatus, 40) || 'active',
  tariffId: toId(user?.tariffId),
  tariffActiveUntil: user?.tariffActiveUntil || null,
  nextChargeAt: user?.nextChargeAt || null,
})
