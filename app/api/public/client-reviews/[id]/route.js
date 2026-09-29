import ClientReviews from '@models/ClientReviews'
import { checkRateLimit } from '@server/rateLimit'
import { sendPushToTenant } from '@server/pushNotifications'
import {
  publicReview,
  reviewEntities,
  reviewError,
  reviewResponse,
} from '@server/clientReviews'
import { validateReviewAnswer } from '@helpers/clientReviews.mjs'

const resolve = async (req, params) => {
  const { id } = await params
  const rate = await checkRateLimit({
    req,
    scope: 'client-review-public',
    limit: 60,
    windowMs: 60000,
  })
  if (!rate.ok)
    return {
      response: reviewError('Слишком много запросов. Попробуйте позже.', 429),
    }
  const review = await publicReview(req, id)
  if (!review) return { response: reviewError('Ссылка недействительна', 404) }
  const { available } = await reviewEntities(review)
  if (!available || review.revokedAt)
    return { response: reviewError('Ссылка больше не действует', 410) }
  if (!review.submittedAt && review.expiresAt <= new Date())
    return {
      response: reviewError(
        'Срок ссылки истёк. Попросите исполнителя отправить новую.',
        410
      ),
    }
  return { review }
}
const dto = (review) => ({
  performerName: review.performerName,
  eventDate: review.eventDate,
  submitted: Boolean(review.submittedAt),
})

export const GET = async (req, { params }) => {
  const result = await resolve(req, params)
  return result.response || reviewResponse(dto(result.review))
}
export const POST = async (req, { params }) => {
  const result = await resolve(req, params)
  if (result.response) return result.response
  const { review } = result
  if (review.submittedAt) return reviewResponse({ submitted: true })
  const raw = await req.text()
  if (raw.length > 12000) return reviewError('Слишком большой запрос', 413)
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return reviewError('Некорректный запрос')
  }
  const error = validateReviewAnswer(body)
  if (error) return reviewError(error)
  const updated = await ClientReviews.findOneAndUpdate(
    {
      _id: review._id,
      tenantId: review.tenantId,
      tokenHash: review.tokenHash,
      submittedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        rating: body.rating,
        comment: (body.comment || '').trim(),
        submittedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  ).lean()
  if (!updated) {
    const current = await ClientReviews.findOne({
      _id: review._id,
      tenantId: review.tenantId,
      tokenHash: review.tokenHash,
    }).lean()
    return current?.submittedAt
      ? reviewResponse({ submitted: true })
      : reviewError('Ссылка больше не действует', 410)
  }
  await sendPushToTenant({
    tenantId: review.tenantId,
    source: 'client-review',
    payload: {
      title: 'Новый отзыв клиента',
      body: `Оценка работы: ${body.rating} из 5`,
      tag: `client-review-${review._id}`,
      data: {
        type: 'client_review',
        eventId: String(review.eventId),
        url: '/cabinet/client-reviews',
      },
    },
  }).catch(() => null)
  return reviewResponse({ submitted: true })
}
