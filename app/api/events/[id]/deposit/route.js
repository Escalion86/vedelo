import { createHash } from 'node:crypto'
import { after, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Events from '@models/Events'
import Transactions from '@models/Transactions'
import Clients from '@models/Clients'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { recordActivityHistory } from '@server/activityHistory'
import { updateEventInCalendar } from '@server/CRUD'

const fail = (error, status = 400) =>
  NextResponse.json({ success: false, error }, { status })

// A stable ID makes retries (including from another tab) safe on standalone MongoDB.
// Write the payment first, then confirm the draft. A retry completes that second step.
export const POST = async (req, { params }) => {
  const context = await getRequestContext(req)
  const { tenantId, user } = context
  if (!tenantId) return fail('Не авторизован', 401)
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id))
    return fail('Некорректный идентификатор')
  let body
  try {
    body = await req.json()
  } catch {
    return fail('Некорректный запрос')
  }
  const amount = Number(body?.amount)
  if (!Number.isFinite(amount) || amount <= 0)
    return fail('Укажите сумму больше нуля')
  if (!['transfer', 'account', 'cash', 'barter'].includes(body?.paymentMethod))
    return fail('Выберите способ получения задатка')

  await dbConnect()
  const event = await Events.findOne({ _id: id, tenantId }).lean()
  if (!event) return fail('Запись не найдена', 404)
  if (!['draft', 'active'].includes(event.status))
    return fail(
      'Получение задатка недоступно для закрытой или отменённой записи',
      409
    )
  if (
    event.status === 'draft' &&
    (!event.eventDate || !Number.isFinite(new Date(event.eventDate).getTime()))
  )
    return fail('Перед подтверждением заявки укажите дату в её редакторе')
  if (
    event.clientId &&
    !(await Clients.exists({ _id: event.clientId, tenantId }))
  )
    return fail('Клиент не найден', 404)

  const transactionId = createHash('sha256')
    .update(`deposit-received:${tenantId}:${String(event._id)}`)
    .digest('hex')
    .slice(0, 24)
  let transaction = await Transactions.findOne({
    _id: transactionId,
    tenantId,
    eventId: id,
  }).lean()
  if (!transaction) {
    if (!event.waitDeposit) return fail('Ожидание задатка отключено', 409)
    if (
      await Transactions.exists({
        tenantId,
        eventId: id,
        type: 'income',
        category: { $in: ['deposit', 'advance'] },
        amount: { $gt: 0 },
        paymentMethod: { $ne: 'obligation' },
      })
    )
      return fail('Задаток уже получен. Обновите страницу', 409)
    try {
      const created = await Transactions.create({
        _id: transactionId,
        tenantId,
        eventId: id,
        clientId: event.clientId || null,
        amount,
        paymentMethod: body.paymentMethod,
        type: 'income',
        category: 'deposit',
        date: new Date(),
        comment: 'Задаток получен',
      })
      transaction = created.toObject()
      await recordActivityHistory({
        req,
        context,
        entityType: 'transaction',
        entityId: transaction._id,
        operation: 'create',
        after: transaction,
      })
    } catch (error) {
      if (error?.code !== 11000) throw error
      transaction = await Transactions.findOne({
        _id: transactionId,
        tenantId,
        eventId: id,
      }).lean()
      if (!transaction) throw error
    }
  }
  if (
    transaction.type !== 'income' ||
    transaction.category !== 'deposit' ||
    transaction.amount !== amount ||
    transaction.paymentMethod !== body.paymentMethod
  )
    return fail(
      'Задаток уже записан с другой суммой или способом оплаты. Проверьте транзакции',
      409
    )

  let updatedEvent = event
  if (event.status === 'draft') {
    updatedEvent = await Events.findOneAndUpdate(
      { _id: id, tenantId, status: 'draft', updatedAt: event.updatedAt },
      { $set: { status: 'active' }, $inc: { syncVersion: 1 } },
      { returnDocument: 'after' }
    ).lean()
    if (!updatedEvent) {
      updatedEvent = await Events.findOne({
        _id: id,
        tenantId,
        status: 'active',
      }).lean()
      if (!updatedEvent)
        return fail(
          'Задаток записан, но заявка изменилась. Повторите подтверждение для сверки',
          409
        )
    } else {
      await recordActivityHistory({
        req,
        context,
        entityType: 'event',
        entityId: id,
        operation: 'update',
        before: event,
        after: updatedEvent,
      })
    }
  }
  after(async () => {
    try {
      await updateEventInCalendar(updatedEvent, req, user, event)
    } catch {
      /* Payment is already saved. */
    }
  })
  return NextResponse.json({
    success: true,
    data: transaction,
    event: updatedEvent,
  })
}
