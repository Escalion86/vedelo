import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import AiUsage from '@models/AiUsage'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { getPlatformAiAccessQuote, getTenantAiIncludedState } from '@server/aiBilling'

const FEATURES = [
  'call_transcription',
  'call_analysis',
  'voice_transcription',
  'event_draft',
  'calendar_import',
  'file_analysis',
  'file_import',
]

const toObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(String(value || ''))
    ? new mongoose.Types.ObjectId(String(value))
    : null

const toRubles = (kopecks) => Number(kopecks || 0) / 100
const costToRubles = (microrubles) => Number(microrubles || 0) / 1_000_000
const getUserName = (user) =>
  [user?.secondName, user?.firstName, user?.thirdName]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Пользователь'

const serializeUsage = (item, { admin = false } = {}) => ({
  id: String(item._id),
  feature: item.feature,
  model: item.model || '',
  status: item.status,
  charged: toRubles(item.chargedKopecks),
  audioSeconds: Number(item.audioSeconds || 0),
  totalTokens: Number(item.totalTokens || 0),
  createdAt: item.createdAt,
  ...(admin
    ? {
        tenantId: String(item.tenantId),
        providerCost: costToRubles(item.providerCostMicrorubles),
        uncovered: toRubles(item.uncoveredKopecks),
        markupCoefficient: Number(item.markupCoefficient || 1),
        coveredByTariff: item.coveredByTariff === true,
        errorCode: item.errorCode || '',
      }
    : {}),
})

const loadUserUsage = async (tenantId) => {
  const tenantObjectId = toObjectId(tenantId)
  const tariffIncluded = await getTenantAiIncludedState({ tenantId })
  const [summaryRows, recent, quotes] = await Promise.all([
    AiUsage.aggregate([
      {
        $match: {
          tenantId: tenantObjectId,
          source: 'platform',
          status: 'succeeded',
        },
      },
      {
        $group: {
          _id: null,
          operations: { $sum: 1 },
          chargedKopecks: { $sum: '$chargedKopecks' },
        },
      },
    ]),
    AiUsage.find({ tenantId: tenantObjectId, source: 'platform' })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    Promise.all(
      FEATURES.map(async (feature) => ({
        feature,
        ...(await getPlatformAiAccessQuote({ tenantId, feature, tariffIncluded })),
      }))
    ),
  ])
  const summary = summaryRows[0] || {}
  const requiredBalanceRub = Math.max(
    ...quotes.map((quote) => Number(quote.requiredBalanceRub || 0))
  )
  const balanceRub = Number(quotes[0]?.balanceRub || 0)

  return {
    balance: balanceRub,
    requiredBalance: requiredBalanceRub,
    available: quotes.every((quote) => quote.available),
    platformConfigured: Boolean(quotes[0]?.platformConfigured),
    tariffIncluded,
    quotes: quotes.map((quote) => ({
      feature: quote.feature,
      requiredBalance: quote.requiredBalanceRub,
      available: quote.available,
    })),
    summary: {
      operations: Number(summary.operations || 0),
      charged: toRubles(summary.chargedKopecks),
    },
    recent: recent.map((item) => serializeUsage(item)),
  }
}

const loadAdminUsage = async () => {
  const [summaryRows, breakdownRows, userRows, recent] = await Promise.all([
    AiUsage.aggregate([
      { $match: { source: 'platform', status: 'succeeded' } },
      {
        $group: {
          _id: null,
          operations: { $sum: 1 },
          chargedKopecks: { $sum: '$chargedKopecks' },
          providerCostMicrorubles: { $sum: '$providerCostMicrorubles' },
          uncoveredKopecks: { $sum: '$uncoveredKopecks' },
          coveredProviderCostMicrorubles: {
            $sum: {
              $cond: ['$coveredByTariff', '$providerCostMicrorubles', 0],
            },
          },
          coveredOperations: { $sum: { $cond: ['$coveredByTariff', 1, 0] } },
        },
      },
    ]),
    AiUsage.aggregate([
      { $match: { source: 'platform', status: 'succeeded' } },
      {
        $group: {
          _id: '$feature',
          operations: { $sum: 1 },
          chargedKopecks: { $sum: '$chargedKopecks' },
          providerCostMicrorubles: { $sum: '$providerCostMicrorubles' },
        },
      },
      { $sort: { chargedKopecks: -1 } },
    ]),
    AiUsage.aggregate([
      { $match: { source: 'platform', status: 'succeeded' } },
      {
        $group: {
          _id: '$tenantId',
          operations: { $sum: 1 },
          chargedKopecks: { $sum: '$chargedKopecks' },
          providerCostMicrorubles: { $sum: '$providerCostMicrorubles' },
          coveredProviderCostMicrorubles: {
            $sum: {
              $cond: ['$coveredByTariff', '$providerCostMicrorubles', 0],
            },
          },
        },
      },
      { $sort: { chargedKopecks: -1 } },
      { $limit: 100 },
    ]),
    AiUsage.find({ source: 'platform' })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ])
  const users = userRows.length
    ? await Users.find({ _id: { $in: userRows.map((item) => item._id) } })
        .select('_id firstName secondName thirdName email balance')
        .lean()
    : []
  const usersById = new Map(users.map((user) => [String(user._id), user]))
  const summary = summaryRows[0] || {}
  const providerCost = costToRubles(summary.providerCostMicrorubles)
  const charged = toRubles(summary.chargedKopecks)

  return {
    summary: {
      operations: Number(summary.operations || 0),
      providerCost,
      charged,
      margin: charged - providerCost,
      uncovered: toRubles(summary.uncoveredKopecks),
      tariffCoveredOperations: Number(summary.coveredOperations || 0),
      tariffCoveredCost: costToRubles(summary.coveredProviderCostMicrorubles),
    },
    breakdown: breakdownRows.map((item) => ({
      feature: item._id,
      operations: Number(item.operations || 0),
      providerCost: costToRubles(item.providerCostMicrorubles),
      charged: toRubles(item.chargedKopecks),
    })),
    users: userRows.map((item) => {
      const user = usersById.get(String(item._id))
      const userProviderCost = costToRubles(item.providerCostMicrorubles)
      const userCharged = toRubles(item.chargedKopecks)
      return {
        tenantId: String(item._id),
        name: getUserName(user),
        email: user?.email || '',
        balance: Number(user?.balance || 0),
        operations: Number(item.operations || 0),
        providerCost: userProviderCost,
        charged: userCharged,
        margin: userCharged - userProviderCost,
        tariffCoveredCost: costToRubles(item.coveredProviderCostMicrorubles),
      }
    }),
    recent: recent.map((item) => serializeUsage(item, { admin: true })),
  }
}

export const GET = async (req) => {
  const { user, tenantId } = await getRequestContext(req)
  if (!user || !tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  await dbConnect()
  const scope = new URL(req.url).searchParams.get('scope') || 'mine'
  if (scope === 'admin') {
    if (user.role !== 'dev') {
      return NextResponse.json(
        { success: false, error: 'Нет доступа' },
        { status: 403 }
      )
    }
    return NextResponse.json({ success: true, data: await loadAdminUsage() })
  }

  return NextResponse.json({
    success: true,
    data: await loadUserUsage(tenantId),
  })
}
