export const REVIEW_DAYS = 30
export const REVIEW_COMMENT_LIMIT = 2000

export const canRequestClientReview = (event, now = Date.now()) => {
  if (!event?.clientId || event.isDemo) return false
  if (event.status === 'closed') return true
  if (event.status !== 'active') return false
  const end = event.dateEnd || event.eventDate
  return Boolean(end) && new Date(end).getTime() <= now
}

export const reviewStatus = (review, now = Date.now()) => {
  if (review.submittedAt) return 'received'
  if (review.revokedAt) return 'revoked'
  if (new Date(review.expiresAt).getTime() <= now) return 'expired'
  return review.sentAt ? 'sent' : 'created'
}

export const REVIEW_STATUS_LABELS = {
  received: 'Отзыв получен',
  revoked: 'Ссылка отключена',
  expired: 'Ссылка истекла',
  sent: 'Отправлено вручную',
  created: 'Ссылка создана',
}

export const validateReviewAnswer = (body) => {
  if (!Number.isInteger(body?.rating) || body.rating < 1 || body.rating > 5)
    return 'Выберите оценку от 1 до 5'
  if (body.comment !== undefined && typeof body.comment !== 'string')
    return 'Комментарий должен быть текстом'
  if ((body.comment || '').length > REVIEW_COMMENT_LIMIT)
    return `Комментарий не должен превышать ${REVIEW_COMMENT_LIMIT} символов`
  return ''
}
