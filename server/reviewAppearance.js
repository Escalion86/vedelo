import SiteSettings from '@models/SiteSettings'
import ClientReviews from '@models/ClientReviews'
import dbConnect from '@server/dbConnect'
import { validReviewId } from '@server/clientReviews'
import {
  hasSavedReviewAppearance,
  normalizeReviewAppearance,
  validateReviewPageInput,
} from '@helpers/reviewAppearance.mjs'

export const getTenantReviewPage = async (tenantId) => {
  await dbConnect()
  const settings = await SiteSettings.findOne({ tenantId })
    .select('reviewPage')
    .lean()
  return normalizeReviewAppearance(settings?.reviewPage, tenantId)
}

export const saveTenantReviewPage = async (tenantId, payload) => {
  const validation = validateReviewPageInput(payload, tenantId)
  if (validation.error) return { error: validation.error }
  await dbConnect()
  const updated = await SiteSettings.findOneAndUpdate(
    { tenantId },
    { $set: { tenantId, reviewPage: validation.value } },
    { upsert: true, returnDocument: 'after' }
  ).lean()
  return {
    appearance: normalizeReviewAppearance(
      updated?.reviewPage ?? validation.value,
      tenantId
    ),
  }
}

// Публичный слой страницы отзыва по ID приглашения (без секрета, для
// краулеров и метаданных). Отдаём только явно сохранённое оформление;
// отозванные и истёкшие без ответа ссылки получают нейтральный fallback.
export const publicReviewAppearance = async (id) => {
  if (!validReviewId(id)) return null
  await dbConnect()
  const review = await ClientReviews.findOne({ _id: id })
    .select('tenantId revokedAt submittedAt expiresAt')
    .lean()
  if (!review || review.revokedAt) return null
  if (!review.submittedAt && new Date(review.expiresAt).getTime() <= Date.now())
    return null
  return tenantReviewAppearance(review.tenantId)
}

// Оформление конкретного tenant (без проверок ссылки).
export const tenantReviewAppearance = async (tenantId) => {
  const appearance = await getTenantReviewPage(tenantId)
  return hasSavedReviewAppearance(appearance) ? appearance : null
}
