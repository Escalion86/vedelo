import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import SupportTickets from '@models/SupportTickets'
import SupportTicketMessages from '@models/SupportTicketMessages'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { checkRateLimit, rateLimitResponse } from '@server/rateLimit'
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
  buildSupportTicketCreationTarget,
  buildSupportTicketAccessQuery,
  createSupportObjectId,
  getSupportActorLabel,
  isSupportDeveloper,
  notifySupportMessage,
  serializeSupportMessage,
  serializeSupportTicket,
  uploadSupportAttachments,
  validateSupportFiles,
  validateSupportText,
} from '@server/supportTickets'

export const runtime = 'nodejs'

const errorResponse = (code, message, status = 400) =>
  NextResponse.json({ success: false, error: { code, message } }, { status })

const parseLimit = (value) => {
  const number = Number(value)
  return Number.isFinite(number)
    ? Math.min(100, Math.max(1, Math.trunc(number)))
    : 30
}

const parseCursor = (value) => {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    const date = new Date(parsed?.date)
    if (
      Number.isNaN(date.getTime()) ||
      !mongoose.Types.ObjectId.isValid(parsed?.id)
    )
      return null
    return { date, id: new mongoose.Types.ObjectId(parsed.id) }
  } catch {
    return null
  }
}

const makeCursor = (ticket) =>
  Buffer.from(
    JSON.stringify({ date: ticket.lastMessageAt, id: String(ticket._id) })
  ).toString('base64url')

export const GET = async (req) => {
  const context = await getRequestContext(req)
  if (!context?.tenantId)
    return errorResponse('UNAUTHORIZED', 'Не авторизован', 401)

  const { searchParams } = new URL(req.url)
  const status = String(searchParams.get('status') || '')
  const category = String(searchParams.get('category') || '')
  const limit = parseLimit(searchParams.get('limit'))
  const cursor = parseCursor(searchParams.get('cursor'))
  const query = buildSupportTicketAccessQuery(context)
  if (SUPPORT_STATUSES.has(status)) query.status = status
  if (SUPPORT_CATEGORIES.has(category)) query.category = category
  if (cursor) {
    query.$or = [
      { lastMessageAt: { $lt: cursor.date } },
      { lastMessageAt: cursor.date, _id: { $lt: cursor.id } },
    ]
  }

  await dbConnect()
  const rows = await SupportTickets.find(query)
    .sort({ lastMessageAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]
  const developer = isSupportDeveloper(context)
  return NextResponse.json({
    success: true,
    data: items.map((item) => serializeSupportTicket(item, developer)),
    meta: { hasMore, nextCursor: hasMore && last ? makeCursor(last) : null },
  })
}

export const POST = async (req) => {
  const context = await getRequestContext(req)
  if (!context?.tenantId || !context?.user?._id) {
    return errorResponse('UNAUTHORIZED', 'Не авторизован', 401)
  }
  const rateLimit = await checkRateLimit({
    req,
    scope: 'support_ticket_create',
    limit: 10,
    windowMs: 60 * 60 * 1000,
    keyParts: [context.tenantId, context.user._id],
  })
  if (!rateLimit.ok) return rateLimitResponse(NextResponse, rateLimit)

  const form = await req.formData().catch(() => null)
  if (!form) return errorResponse('INVALID_FORM', 'Некорректная форма')
  const files = form.getAll('files')
  const validation = validateSupportText({
    title: form.get('title'),
    body: form.get('message'),
    category: String(form.get('category') || ''),
    requireTitle: true,
  })
  if (!validation.ok) return errorResponse('VALIDATION_ERROR', validation.error)
  const fileValidation = await validateSupportFiles(files)
  if (!fileValidation.ok)
    return errorResponse('FILE_VALIDATION_ERROR', fileValidation.error)

  await dbConnect()
  const developer = isSupportDeveloper(context)
  let targetUser = null
  if (developer) {
    const targetUserId = String(form.get('targetUserId') || '')
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return errorResponse('VALIDATION_ERROR', 'Выберите пользователя')
    }
    targetUser = await Users.findOne({
      _id: targetUserId,
      archive: { $ne: true },
    })
      .select('_id tenantId firstName secondName email phone')
      .lean()
    if (!targetUser) {
      return errorResponse(
        'TARGET_USER_NOT_FOUND',
        'Пользователь не найден',
        404
      )
    }
  }
  const creationTarget = buildSupportTicketCreationTarget({
    context,
    targetUser,
  })
  if (!creationTarget?.tenantId || !creationTarget?.createdBy) {
    return errorResponse(
      'VALIDATION_ERROR',
      'Не удалось определить пользователя'
    )
  }
  const ticketId = createSupportObjectId()
  let attachments = []
  try {
    attachments = await uploadSupportAttachments({
      files,
      tenantId: creationTarget.tenantId,
      ticketId,
    })
  } catch (error) {
    console.warn('support attachment upload failed', { error: error?.message })
    return errorResponse(
      'FILE_UPLOAD_FAILED',
      'Не удалось загрузить изображения',
      502
    )
  }

  const now = new Date()
  const actorRole = creationTarget.actorRole
  const actorLabel = getSupportActorLabel(context.user)
  let ticket = null
  try {
    ticket = await SupportTickets.create({
      _id: ticketId,
      tenantId: creationTarget.tenantId,
      createdBy: creationTarget.createdBy,
      createdByLabel: creationTarget.createdByLabel,
      category: validation.category,
      title: validation.title,
      status: 'open',
      lastMessageAt: now,
      lastMessageByRole: actorRole,
      userLastReadAt: actorRole === 'user' ? now : null,
      developerLastReadAt: actorRole === 'developer' ? now : null,
    })
    const message = await SupportTicketMessages.create({
      ticketId,
      tenantId: creationTarget.tenantId,
      authorId: context.user._id,
      authorRole: actorRole,
      authorLabel: actorLabel,
      body: validation.body,
      attachments,
    })
    await notifySupportMessage({
      ticket: ticket.toObject(),
      actorRole,
      isNewTicket: true,
    })
    return NextResponse.json(
      {
        success: true,
        data: {
          ticket: serializeSupportTicket(ticket.toObject(), developer),
          message: serializeSupportMessage(message.toObject()),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (ticket)
      await SupportTickets.deleteOne({ _id: ticketId }).catch(() => null)
    console.error('support ticket create failed', { error: error?.message })
    return errorResponse('CREATE_FAILED', 'Не удалось создать обращение', 500)
  }
}
