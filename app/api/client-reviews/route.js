import mongoose from 'mongoose'
import ClientReviews from '@models/ClientReviews'
import Events from '@models/Events'
import Clients from '@models/Clients'
import getPersonFullName from '@helpers/getPersonFullName'
import { canRequestClientReview } from '@helpers/clientReviews.mjs'
import {
  reviewContext,
  reviewError,
  reviewResponse,
  reviewDto,
  reviewCredentials,
  reviewLink,
  validReviewId,
} from '@server/clientReviews'

export const GET = async (req) => {
  const ctx = await reviewContext()
  if (ctx.response) return ctx.response
  const params = new URL(req.url).searchParams
  const filter = { tenantId: ctx.tenantId }
  for (const key of ['eventId', 'clientId']) {
    if (!params.has(key)) continue
    const value = params.get(key)
    if (!validReviewId(value)) return reviewError('Некорректный идентификатор')
    filter[key] = value
  }
  if (params.get('unread') === 'true')
    Object.assign(filter, { submittedAt: { $ne: null }, readAt: null })
  if (params.has('rating')) {
    const rating = Number(params.get('rating'))
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return reviewError('Некорректная оценка')
    filter.rating = rating
  }
  for (const key of ['from', 'to']) {
    if (!params.has(key)) continue
    const value = params.get(key)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
      return reviewError('Некорректная дата')
    filter.createdAt ||= {}
    filter.createdAt[key === 'from' ? '$gte' : '$lt'] = new Date(
      Date.parse(value) + (key === 'to' ? 86400000 : 0)
    )
  }
  const page = Math.max(0, Math.min(10000, Number(params.get('page')) || 0))
  const [rows, total] = await Promise.all([
    ClientReviews.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(Math.floor(page) * 30)
      .limit(30)
      .lean(),
    ClientReviews.countDocuments(filter),
  ])
  const [clients, events] = await Promise.all([
    Clients.find({
      tenantId: ctx.tenantId,
      _id: { $in: rows.map((row) => row.clientId) },
    })
      .select('firstName secondName thirdName')
      .lean(),
    Events.find({
      tenantId: ctx.tenantId,
      _id: { $in: rows.map((row) => row.eventId) },
    })
      .select('eventType eventDate')
      .lean(),
  ])
  const clientNames = new Map(
    clients.map((client) => [String(client._id), getPersonFullName(client)])
  )
  const eventNames = new Map(
    events.map((event) => [String(event._id), event.eventType])
  )
  return reviewResponse({
    items: rows.map((row) => ({
      ...reviewDto(row),
      clientName: clientNames.get(String(row.clientId)) || 'Клиент недоступен',
      eventTitle: eventNames.get(String(row.eventId)) || '',
      eventDate: row.eventDate,
    })),
    total,
    allowClientReviews: Boolean(ctx.access?.allowClientReviews),
  })
}

export const POST = async (req) => {
  const ctx = await reviewContext(true)
  if (ctx.response) return ctx.response
  const body = await req.json().catch(() => null)
  if (!validReviewId(body?.eventId))
    return reviewError('Некорректный идентификатор')
  const event = await Events.findOne({
    _id: body.eventId,
    tenantId: ctx.tenantId,
  }).lean()
  if (!event) return reviewError('Работа не найдена', 404)
  if (!canRequestClientReview(event))
    return reviewError('Запросить отзыв можно после выполнения работы', 409)
  if (event.status !== 'closed' && body.confirmedCompleted !== true)
    return reviewError('Подтвердите, что работа выполнена', 409)
  if (!(await Clients.exists({ _id: event.clientId, tenantId: ctx.tenantId })))
    return reviewError('Клиент не найден', 404)
  const filter = { tenantId: ctx.tenantId, eventId: event._id }
  let review = await ClientReviews.findOne(filter).select('+nonce').lean()
  if (!review) {
    await ClientReviews.init()
    const _id = new mongoose.Types.ObjectId()
    try {
      review = await ClientReviews.create({
        _id,
        ...filter,
        clientId: event.clientId,
        createdBy: ctx.user._id,
        performerName: getPersonFullName(ctx.user) || 'Исполнитель',
        eventDate: event.eventDate,
        ...reviewCredentials(_id),
      })
    } catch (error) {
      if (error.code !== 11000) throw error
      review = await ClientReviews.findOne(filter).select('+nonce').lean()
    }
  }
  const dto = reviewDto(review)
  return reviewResponse({
    ...dto,
    url: ['created', 'sent'].includes(dto.status) ? reviewLink(review) : null,
  })
}
