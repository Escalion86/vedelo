import crypto from 'crypto'
import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import ClientReviews from '@models/ClientReviews'
import Events from '@models/Events'
import Clients from '@models/Clients'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { REVIEW_DAYS, reviewStatus, canRequestClientReview } from '@helpers/clientReviews.mjs'

export const reviewHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}
export const reviewResponse = (data, status = 200) =>
  NextResponse.json({ success: true, data }, { status, headers: reviewHeaders })
export const reviewError = (message, status = 400) =>
  NextResponse.json(
    {
      success: false,
      error: { code: `review_${status}`, type: 'client_review', message },
    },
    { status, headers: reviewHeaders }
  )
export const validReviewId = (id) =>
  typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)
const tokenHash = (token) =>
  crypto.createHash('sha256').update(token).digest('hex')
const recoverToken = (review) => {
  if (!process.env.NEXTAUTH_SECRET) throw new Error('Review secret unavailable')
  return crypto
    .createHmac('sha256', process.env.NEXTAUTH_SECRET)
    .update(`client-review:${review._id}:${review.nonce}`)
    .digest('base64url')
}
export const reviewCredentials = (id) => {
  const nonce = crypto.randomBytes(32).toString('base64url')
  return {
    nonce,
    tokenHash: tokenHash(recoverToken({ _id: id, nonce })),
    expiresAt: new Date(Date.now() + REVIEW_DAYS * 86400000),
  }
}
export const reviewOrigin = () => {
  const configured = process.env.DOMAIN || 'https://vedelo.ru'
  return new URL(
    /^https?:\/\//.test(configured) ? configured : `https://${configured}`
  ).origin
}
export const reviewLink = (review) => {
  // Fragment не отправляется серверу и не попадает в access logs / Referer.
  return `${reviewOrigin()}/review/${review._id}#${recoverToken(review)}`
}
export const reviewDto = (review) => ({
  _id: String(review._id),
  eventId: String(review.eventId),
  clientId: String(review.clientId),
  status: reviewStatus(review),
  createdAt: review.createdAt,
  expiresAt: review.expiresAt,
  sentAt: review.sentAt,
  submittedAt: review.submittedAt,
  readAt: review.readAt,
  rating: review.rating,
  comment: review.comment || '',
  note: review.note || '',
})
export const reviewContext = async (requireFeature = false) => {
  const { user, tenantId } = await getTenantContext()
  if (!user || !tenantId)
    return { response: reviewError('Требуется авторизация', 401) }
  if (user.archive) return { response: reviewError('Доступ недоступен', 403) }
  const access = await getUserTariffAccess(user._id)
  if (requireFeature && !access?.allowClientReviews)
    return {
      response: reviewError('Доступно на тарифе с отзывами клиентов', 403),
    }
  return { user, tenantId, access }
}
export const reviewEntities = async (review) => {
  const [event, client, owner] = await Promise.all([
    Events.findOne({ _id: review.eventId, tenantId: review.tenantId }).lean(),
    Clients.findOne({ _id: review.clientId, tenantId: review.tenantId })
      .select('_id')
      .lean(),
    Users.findOne({
      _id: review.createdBy,
      archive: { $ne: true },
      $or: [{ tenantId: review.tenantId }, { _id: review.tenantId }],
    })
      .select('_id')
      .lean(),
  ])
  return {
    event,
    available: Boolean(
      event &&
      client &&
      owner &&
      canRequestClientReview(event) &&
      String(event.clientId) === String(review.clientId)
    ),
  }
}
export const publicReview = async (req, id) => {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') || ''
  if (!validReviewId(id) || !/^[\w-]{43}$/.test(token)) return null
  await dbConnect()
  // Секретная capability-ссылка определяет tenant; клиент не задаёт tenantId.
  const review = await ClientReviews.findOne({
    _id: new mongoose.Types.ObjectId(id),
  })
    .select('+tokenHash')
    .lean()
  if (
    !review ||
    !review.tokenHash ||
    !crypto.timingSafeEqual(
      Buffer.from(tokenHash(token)),
      Buffer.from(review.tokenHash)
    )
  )
    return null
  return review
}
