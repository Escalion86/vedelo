import mongoose from 'mongoose'
import Tariffs from '@models/Tariffs'
import Users from '@models/Users'
import { applyTariffPurchase } from '@server/billing'
import dbConnect from '@server/dbConnect'
import { getAiIncludedExampleRates } from '@server/aiIncludedEstimate'
import { serializeMobileAiIncludedRates } from '@server/mobile/billing'
import getRequestContext from '@server/getRequestContext'
import {
  getMobileBillingUserFilter,
  loadMobileBilling,
} from '@server/mobile/billingStore'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'

// The same cached aggregates as web estimates; failure keeps old-client fallback.
const withIncludedRates = async (billing) => {
  try {
    return { ...billing, aiIncludedRates: serializeMobileAiIncludedRates(await getAiIncludedExampleRates()) }
  } catch {
    return billing
  }
}

const getContext = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId) return null
  return context
}

export const GET = async (req) => {
  const context = await getContext(req)
  if (!context) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  const billing = await loadMobileBilling({
    userId: context.user._id,
    tenantId: context.tenantId,
  })
  if (!billing) return mobileError('USER_NOT_FOUND', 'Пользователь не найден', 404)
  return mobileSuccess(await withIncludedRates(billing))
}

export const POST = async (req) => {
  const context = await getContext(req)
  if (!context) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  const body = await req.json().catch(() => ({}))
  const tariffId = String(body?.tariffId || '')
  if (!mongoose.isValidObjectId(tariffId)) {
    return mobileError('TARIFF_INVALID', 'Тариф не найден', 400, 'tariffId')
  }
  await dbConnect()
  const [user, tariff] = await Promise.all([
    Users.findOne(
      getMobileBillingUserFilter({
        userId: context.user._id,
        tenantId: context.tenantId,
      })
    ),
    Tariffs.findOne({ _id: tariffId, hidden: { $ne: true } }).lean(),
  ])
  if (!user) return mobileError('USER_NOT_FOUND', 'Пользователь не найден', 404)
  if (!tariff) return mobileError('TARIFF_NOT_FOUND', 'Тариф не найден', 404)
  if (String(user.tariffId || '') === tariffId) {
    return mobileError('TARIFF_CURRENT', 'Этот тариф уже подключён', 409)
  }
  const currentTariff = user.tariffId
    ? await Tariffs.findById(user.tariffId).lean()
    : null
  const activeUntil = user.tariffActiveUntil
    ? new Date(user.tariffActiveUntil)
    : null
  if (
    Number(currentTariff?.price ?? 0) > 0 &&
    Number(tariff.price ?? 0) <= 0 &&
    activeUntil &&
    !Number.isNaN(activeUntil.getTime()) &&
    activeUntil > new Date()
  ) {
    return mobileError(
      'TARIFF_PAID_ACTIVE',
      'Оплаченный тариф действует до окончания текущего периода',
      409
    )
  }
  const result = await applyTariffPurchase({
    userId: user._id,
    tariffId: tariff._id,
  })
  if (!result.ok) {
    const insufficient = String(result.error || '').startsWith('Недостаточно средств')
    return mobileError(
      insufficient ? 'BALANCE_INSUFFICIENT' : 'TARIFF_CHANGE_FAILED',
      result.error || 'Не удалось сменить тариф',
      insufficient ? 402 : 400
    )
  }
  const billing = await loadMobileBilling({
    userId: context.user._id,
    tenantId: context.tenantId,
  })
  return mobileSuccess(await withIncludedRates(billing))
}
