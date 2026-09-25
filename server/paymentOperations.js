import { buildMissingPaymentReceiptFilter } from './paymentHistory.js'

const PAYMENT_CATEGORIES = new Set([
  'all',
  'receipt_missing',
  'tariff',
  'topup',
  'bonus',
  'refund',
  'charge',
])

const PAYMENT_STATUSES = new Set([
  'all',
  'pending',
  'succeeded',
  'canceled',
  'failed',
])
const PAYMENT_SOURCES = new Set([
  'all',
  'manual',
  'system',
  'yookassa',
  'tochka',
])
const PAYMENT_DIRECTIONS = new Set(['all', 'in', 'out'])
const PAYMENT_SORTS = new Set(['newest', 'oldest', 'amount_desc', 'amount_asc'])

const normalizeValue = (value, allowed, fallback = 'all') =>
  allowed.has(value) ? value : fallback

const parseDate = (value, endOfDay = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null
  const date = new Date(
    `${value}${endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'}Z`
  )
  return Number.isNaN(date.getTime()) ? null : date
}

export const parsePaymentOperationsParams = (searchParams) => ({
  category: normalizeValue(searchParams.get('category'), PAYMENT_CATEGORIES),
  status: normalizeValue(searchParams.get('status'), PAYMENT_STATUSES),
  source: normalizeValue(searchParams.get('source'), PAYMENT_SOURCES),
  direction: normalizeValue(searchParams.get('direction'), PAYMENT_DIRECTIONS),
  sort: normalizeValue(searchParams.get('sort'), PAYMENT_SORTS, 'newest'),
  dateFrom: parseDate(searchParams.get('dateFrom')),
  dateTo: parseDate(searchParams.get('dateTo'), true),
  search: String(searchParams.get('search') || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120),
})

export const buildPaymentOperationsFilter = ({
  category = 'all',
  status = 'all',
  source = 'all',
  direction = 'all',
  dateFrom = null,
  dateTo = null,
  userIds = null,
} = {}) => {
  const conditions = []

  if (Array.isArray(userIds)) conditions.push({ userId: { $in: userIds } })
  if (status !== 'all') conditions.push({ status })
  if (source !== 'all') conditions.push({ source })
  if (direction === 'in')
    conditions.push({ type: { $in: ['topup', 'refund'] } })
  if (direction === 'out') conditions.push({ type: 'charge' })

  if (category === 'tariff') {
    conditions.push({
      $or: [
        { purpose: 'tariff' },
        {
          type: 'charge',
          source: 'system',
          tariffId: { $ne: null },
          purpose: { $ne: 'ai' },
        },
      ],
    })
  }
  if (category === 'topup') {
    conditions.push({ type: 'topup' })
    conditions.push({ purpose: 'balance' })
    conditions.push({ source: { $ne: 'system' } })
  }
  if (category === 'bonus') {
    conditions.push({ type: 'topup' })
    conditions.push({ source: 'system' })
  }
  if (category === 'refund') conditions.push({ type: 'refund' })
  if (category === 'charge') conditions.push({ type: 'charge' })
  if (category === 'receipt_missing')
    conditions.push(buildMissingPaymentReceiptFilter())

  if (dateFrom || dateTo) {
    const createdAt = {}
    if (dateFrom) createdAt.$gte = dateFrom
    if (dateTo) createdAt.$lte = dateTo
    conditions.push({ createdAt })
  }

  if (conditions.length === 0) return {}
  if (conditions.length === 1) return conditions[0]
  return { $and: conditions }
}

export const getPaymentOperationsSort = (sort = 'newest') => {
  if (sort === 'oldest') return { createdAt: 1, _id: 1 }
  if (sort === 'amount_desc') return { amount: -1, createdAt: -1, _id: -1 }
  if (sort === 'amount_asc') return { amount: 1, createdAt: -1, _id: -1 }
  return { createdAt: -1, _id: -1 }
}

export const getPaymentOperationsUserSearchFilter = (search) => {
  if (!search) return null
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = new RegExp(escaped, 'i')
  return {
    $or: [
      { firstName: expression },
      { secondName: expression },
      { thirdName: expression },
      { email: expression },
      { phone: expression },
      { telegram: expression },
    ],
  }
}

export const serializePaymentOperationsUser = (user) => {
  const name = [user?.secondName, user?.firstName, user?.thirdName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
  const contacts = [
    user?.phone ? `+${user.phone}` : '',
    user?.email,
    user?.telegram ? `@${String(user.telegram).replace(/^@/, '')}` : '',
  ].filter(Boolean)
  return {
    id: String(user?._id || ''),
    name: name || 'Без имени',
    contact: contacts[0] || '',
  }
}
