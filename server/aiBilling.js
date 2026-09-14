import { randomUUID } from 'node:crypto'
import AiUsage from '@models/AiUsage'
import Payments from '@models/Payments'
import SiteSettings from '@models/SiteSettings'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'

export const DEFAULT_AI_MARKUP_COEFFICIENT = 1.5
export const DEFAULT_AI_RESERVE_KOPECKS = 100
const AVERAGE_WINDOW = 100

const toNonNegativeNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

export const normalizeAiMarkupCoefficient = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return DEFAULT_AI_MARKUP_COEFFICIENT
  return Math.min(10, Math.max(1, Math.round(number * 100) / 100))
}

const normalizeKopecks = (value) =>
  Math.max(0, Math.round(toNonNegativeNumber(value)))

const rublesToKopecks = (value) =>
  Math.max(0, Math.round(toNonNegativeNumber(value) * 100))

const kopecksToRubles = (value) => normalizeKopecks(value) / 100

export class AiBalanceError extends Error {
  constructor({ requiredBalanceRub, balanceRub }) {
    super('AI_BALANCE_INSUFFICIENT')
    this.name = 'AiBalanceError'
    this.code = 'AI_BALANCE_INSUFFICIENT'
    this.requiredBalanceRub = requiredBalanceRub
    this.balanceRub = balanceRub
  }
}

export const getAiBillingSettings = async () => {
  await dbConnect()
  const settings = await SiteSettings.findOne({ tenantId: null })
    .select('aiBilling')
    .lean()
  return {
    markupCoefficient: normalizeAiMarkupCoefficient(
      settings?.aiBilling?.markupCoefficient
    ),
  }
}

export const getAverageAiChargeKopecks = async (
  feature = '',
  markupCoefficientValue
) => {
  await dbConnect()
  const markupCoefficient =
    markupCoefficientValue === undefined
      ? (await getAiBillingSettings()).markupCoefficient
      : normalizeAiMarkupCoefficient(markupCoefficientValue)
  const baseQuery = {
    source: 'platform',
    status: 'succeeded',
    $or: [
      { providerCostMicrorubles: { $gt: 0 } },
      { chargedKopecks: { $gt: 0 } },
    ],
  }
  const featureItems = await AiUsage.find(
    feature ? { ...baseQuery, feature } : baseQuery
  )
    .sort({ createdAt: -1 })
    .limit(AVERAGE_WINDOW)
    .select('providerCostMicrorubles chargedKopecks markupCoefficient')
    .lean()
  const items = featureItems.length
    ? featureItems
    : feature
      ? await AiUsage.find(baseQuery)
          .sort({ createdAt: -1 })
          .limit(AVERAGE_WINDOW)
          .select('providerCostMicrorubles chargedKopecks markupCoefficient')
          .lean()
      : []
  if (!items.length) return DEFAULT_AI_RESERVE_KOPECKS
  return Math.max(
    1,
    Math.ceil(
      items.reduce((sum, item) => {
        const providerCostMicrorubles = normalizeKopecks(
          item.providerCostMicrorubles
        )
        if (providerCostMicrorubles > 0) {
          return (
            sum +
            Math.max(
              1,
              Math.ceil(
                (providerCostMicrorubles / 1_000_000) *
                  markupCoefficient *
                  100
              )
            )
          )
        }
        return sum + normalizeKopecks(item.chargedKopecks)
      }, 0) / items.length
    )
  )
}

export const getPlatformAiAccessQuote = async ({ tenantId, feature = '' }) => {
  await dbConnect()
  const [{ markupCoefficient }, user] = await Promise.all([
    getAiBillingSettings(),
    Users.findById(tenantId).select('balance').lean(),
  ])
  const averageChargeKopecks = await getAverageAiChargeKopecks(
    feature,
    markupCoefficient
  )
  const balanceRub = toNonNegativeNumber(user?.balance)
  const requiredBalanceRub = kopecksToRubles(averageChargeKopecks)
  const platformConfigured = Boolean(String(process.env.AITUNNEL_KEY || '').trim())
  return {
    balanceRub,
    averageChargeKopecks,
    requiredBalanceRub,
    available: Boolean(
      user && platformConfigured && balanceRub > requiredBalanceRub
    ),
    platformConfigured,
  }
}

export const reservePlatformAiUsage = async ({
  tenantId,
  userId,
  feature,
  model = '',
  groupId = '',
  operationId = randomUUID(),
}) => {
  await dbConnect()
  const { markupCoefficient } = await getAiBillingSettings()
  const reserveKopecks = await getAverageAiChargeKopecks(
    feature,
    markupCoefficient
  )
  const reserveRub = kopecksToRubles(reserveKopecks)

  const usage = await AiUsage.create({
    tenantId,
    userId: userId || tenantId,
    operationId,
    groupId: String(groupId || ''),
    feature,
    provider: 'aitunnel',
    model,
    source: 'platform',
    status: 'reserving',
    reservedKopecks: reserveKopecks,
    markupCoefficient,
  })

  const userBefore = await Users.findOneAndUpdate(
    { _id: tenantId, balance: { $gt: reserveRub } },
    { $inc: { balance: -reserveRub } },
    { returnDocument: 'before' }
  ).lean()

  if (!userBefore) {
    const currentUser = await Users.findById(tenantId).select('balance').lean()
    await AiUsage.findByIdAndUpdate(usage._id, {
      status: 'failed',
      errorCode: 'AI_BALANCE_INSUFFICIENT',
      balanceBefore: toNonNegativeNumber(currentUser?.balance),
      balanceAfter: toNonNegativeNumber(currentUser?.balance),
    })
    throw new AiBalanceError({
      requiredBalanceRub: reserveRub,
      balanceRub: toNonNegativeNumber(currentUser?.balance),
    })
  }

  const balanceBefore = toNonNegativeNumber(userBefore.balance)
  await AiUsage.findByIdAndUpdate(usage._id, {
    status: 'reserved',
    balanceBefore,
    balanceAfter: Math.max(0, balanceBefore - reserveRub),
  })

  return {
    usageId: usage._id,
    tenantId,
    userId: userId || tenantId,
    operationId,
    feature,
    model,
    reserveKopecks,
    markupCoefficient,
  }
}

const getUsageNumbers = (providerUsage = {}) => ({
  promptTokens: normalizeKopecks(
    providerUsage.prompt_tokens ?? providerUsage.input_tokens
  ),
  completionTokens: normalizeKopecks(
    providerUsage.completion_tokens ?? providerUsage.output_tokens
  ),
  totalTokens: normalizeKopecks(providerUsage.total_tokens),
  audioSeconds: toNonNegativeNumber(providerUsage.seconds),
})

export const settlePlatformAiUsage = async (reservation, providerUsage = {}) => {
  if (!reservation?.usageId) return null
  const claimedUsage = await AiUsage.findOneAndUpdate(
    { _id: reservation.usageId, status: 'reserved' },
    { $set: { status: 'settling' } },
    { returnDocument: 'after' }
  ).lean()
  if (!claimedUsage) {
    return AiUsage.findById(reservation.usageId).lean()
  }
  const rawCostRub = Number(providerUsage?.cost_rub)
  const costKnown = Number.isFinite(rawCostRub) && rawCostRub >= 0
  const providerCostMicrorubles = costKnown
    ? Math.max(0, Math.round(rawCostRub * 1_000_000))
    : 0
  const targetChargeKopecks = costKnown
    ? Math.max(
        rawCostRub > 0 ? 1 : 0,
        Math.ceil(rawCostRub * reservation.markupCoefficient * 100)
      )
    : reservation.reserveKopecks
  const differenceKopecks = targetChargeKopecks - reservation.reserveKopecks
  let chargedKopecks = reservation.reserveKopecks
  let uncoveredKopecks = 0

  if (differenceKopecks < 0) {
    const refundKopecks = Math.abs(differenceKopecks)
    await Users.findByIdAndUpdate(reservation.tenantId, {
      $inc: { balance: kopecksToRubles(refundKopecks) },
    })
    chargedKopecks = targetChargeKopecks
  } else if (differenceKopecks > 0) {
    const extraRub = kopecksToRubles(differenceKopecks)
    const userBefore = await Users.findOneAndUpdate(
      { _id: reservation.tenantId, balance: { $gte: extraRub } },
      { $inc: { balance: -extraRub } },
      { returnDocument: 'before' }
    ).lean()
    if (userBefore) {
      chargedKopecks = targetChargeKopecks
    } else {
      const userWithRemainingBalance = await Users.findOneAndUpdate(
        { _id: reservation.tenantId, balance: { $gt: 0 } },
        { $set: { balance: 0 } },
        { returnDocument: 'before' }
      ).lean()
      const availableKopecks = rublesToKopecks(
        userWithRemainingBalance?.balance
      )
      const collectedExtra = Math.min(availableKopecks, differenceKopecks)
      chargedKopecks += collectedExtra
      uncoveredKopecks = differenceKopecks - collectedExtra
    }
  }

  const currentUser = await Users.findById(reservation.tenantId)
    .select('balance')
    .lean()
  const numbers = getUsageNumbers(providerUsage)
  const usage = await AiUsage.findByIdAndUpdate(
    reservation.usageId,
    {
      status: 'succeeded',
      providerCostMicrorubles,
      chargedKopecks,
      uncoveredKopecks,
      balanceAfter: toNonNegativeNumber(currentUser?.balance),
      errorCode: costKnown ? '' : 'AI_COST_UNAVAILABLE',
      ...numbers,
    },
    { returnDocument: 'after' }
  ).lean()

  if (chargedKopecks > 0) {
    await Payments.create({
      tenantId: reservation.tenantId,
      userId: reservation.userId,
      amount: kopecksToRubles(chargedKopecks),
      type: 'charge',
      source: 'system',
      status: 'succeeded',
      purpose: 'ai',
      provider: 'aitunnel',
      idempotenceKey: `ai:${reservation.operationId}`,
      paidAt: new Date(),
      comment: `ИИ Ведело: ${reservation.feature}`,
    }).catch((error) => {
      console.error('[ai-billing] payment ledger failed', {
        usageId: String(reservation.usageId),
        message: error?.message,
      })
    })
  }

  return usage
}

export const failPlatformAiUsage = async (
  reservation,
  errorCode = 'AI_PROVIDER_FAILED'
) => {
  if (!reservation?.usageId) return
  const usage = await AiUsage.findOneAndUpdate(
    { _id: reservation.usageId, status: 'reserved' },
    {
      $set: {
        status: 'failed',
        chargedKopecks: 0,
        errorCode: String(errorCode || 'AI_PROVIDER_FAILED').slice(0, 120),
      },
    },
    { returnDocument: 'before' }
  ).lean()
  if (!usage) return
  const refundRub = kopecksToRubles(reservation.reserveKopecks)
  await Users.findByIdAndUpdate(reservation.tenantId, {
    $inc: { balance: refundRub },
  })
}

export const isAiBalanceError = (error) =>
  error?.code === 'AI_BALANCE_INSUFFICIENT'

export const getAiBalanceErrorMessage = (error) => {
  const required = toNonNegativeNumber(error?.requiredBalanceRub).toFixed(2)
  return `Недостаточно средств для ИИ Ведело. Баланс должен быть больше средней стоимости запроса — ${required} ₽. Пополните баланс или подключите собственный AITunnel.`
}
