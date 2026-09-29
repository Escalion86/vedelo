import ClientReviews from '@models/ClientReviews'
import {
  canRequestClientReview,
  reviewStatus,
} from '@helpers/clientReviews.mjs'
import {
  reviewContext,
  reviewError,
  reviewResponse,
  reviewDto,
  reviewCredentials,
  reviewLink,
  validReviewId,
  reviewEntities,
} from '@server/clientReviews'

export const PATCH = async (req, { params }) => {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const action = body?.action
  if (!['link', 'renew', 'revoke', 'sent', 'read', 'note'].includes(action))
    return reviewError('Неизвестное действие')
  const ctx = await reviewContext(['link', 'renew', 'sent'].includes(action))
  if (ctx.response) return ctx.response
  if (!validReviewId(id)) return reviewError('Некорректный идентификатор')
  const filter = { _id: id, tenantId: ctx.tenantId }
  const review = await ClientReviews.findOne(filter).select('+nonce').lean()
  if (!review) return reviewError('Отзыв не найден', 404)
  let changes = {}
  if (action === 'read') {
    if (!review.submittedAt) return reviewError('Отзыв ещё не получен', 409)
    changes.readAt = review.readAt || new Date()
  } else if (action === 'note') {
    if (typeof body.note !== 'string' || body.note.length > 2000)
      return reviewError('Заметка должна быть не длиннее 2000 символов')
    changes.note = body.note.trim()
  } else {
    if (review.submittedAt) return reviewError('Отзыв уже получен', 409)
    Object.assign(filter, { submittedAt: null, nonce: review.nonce })
    if (action !== 'revoke') {
      const { event, available } = await reviewEntities(review)
      if (!available || !canRequestClientReview(event))
        return reviewError('Запрос больше недоступен', 410)
    }
    if (action === 'renew') {
      if (!['expired', 'revoked'].includes(reviewStatus(review)))
        return reviewError('Ссылка ещё действует', 409)
      changes = { ...reviewCredentials(id), revokedAt: null, sentAt: null }
    } else if (action === 'revoke') changes.revokedAt = new Date()
    else {
      if (!['created', 'sent'].includes(reviewStatus(review)))
        return reviewError('Ссылка больше не действует', 410)
      filter.revokedAt = null
      filter.expiresAt = { $gt: new Date() }
      if (action === 'sent') changes.sentAt = review.sentAt || new Date()
    }
  }
  const updated = await ClientReviews.findOneAndUpdate(
    filter,
    { $set: changes },
    { returnDocument: 'after' }
  )
    .select('+nonce')
    .lean()
  if (!updated) return reviewError('Запрос изменился. Обновите страницу.', 409)
  return reviewResponse({
    ...reviewDto(updated),
    ...(['link', 'renew'].includes(action) ? { url: reviewLink(updated) } : {}),
  })
}
