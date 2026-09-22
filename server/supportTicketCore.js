export const SUPPORT_CATEGORIES = new Set(['bug', 'idea', 'question'])
export const SUPPORT_STATUSES = new Set(['open', 'in_progress', 'resolved'])
export const SUPPORT_MAX_FILES = 5
export const SUPPORT_MAX_FILE_SIZE = 10 * 1024 * 1024
export const SUPPORT_MAX_BODY = 5000
export const SUPPORT_MAX_TITLE = 160

const IMAGE_SIGNATURES = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
}

export const isSupportDeveloper = (context) =>
  context?.user?.role === 'dev' &&
  context?.session?.user?.impersonation?.active !== true

export const getSupportActorLabel = (user) =>
  [user?.firstName, user?.secondName].filter(Boolean).join(' ').trim() ||
  String(user?.email || user?.phone || 'Пользователь').slice(0, 200)

export const buildSupportTicketCreationTarget = ({ context, targetUser }) => {
  if (!isSupportDeveloper(context)) {
    return {
      tenantId: context?.tenantId,
      createdBy: context?.user?._id,
      createdByLabel: getSupportActorLabel(context?.user),
      actorRole: 'user',
    }
  }

  if (!targetUser?._id) return null

  return {
    tenantId: targetUser.tenantId || targetUser._id,
    createdBy: targetUser._id,
    createdByLabel: getSupportActorLabel(targetUser),
    actorRole: 'developer',
  }
}

export const buildSupportTicketAccessQuery = (context, id) => ({
  ...(id ? { _id: id } : {}),
  ...(isSupportDeveloper(context) ? {} : { tenantId: context.tenantId }),
})

export const buildSupportUnreadQuery = (context) => {
  const developer = isSupportDeveloper(context)
  const readField = developer ? 'developerLastReadAt' : 'userLastReadAt'
  const expectedRole = developer ? 'user' : 'developer'

  return {
    ...buildSupportTicketAccessQuery(context),
    lastMessageByRole: expectedRole,
    $expr: {
      $lt: [{ $ifNull: [`$${readField}`, new Date(0)] }, '$lastMessageAt'],
    },
  }
}

const hasSignature = (bytes, signature) =>
  signature.every((value, index) => bytes[index] === value)

export const validateSupportFiles = async (files) => {
  if (files.length > SUPPORT_MAX_FILES)
    return { ok: false, error: 'Можно прикрепить не более 5 изображений' }
  for (const file of files) {
    const fileLike =
      file &&
      typeof file.arrayBuffer === 'function' &&
      typeof file.slice === 'function'
    if (!fileLike || !IMAGE_SIGNATURES[file.type])
      return { ok: false, error: 'Допустимы только JPEG, PNG и WebP' }
    if (file.size <= 0 || file.size > SUPPORT_MAX_FILE_SIZE)
      return {
        ok: false,
        error: 'Размер каждого изображения должен быть не более 10 МБ',
      }
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    const valid =
      IMAGE_SIGNATURES[file.type].some((signature) =>
        hasSignature(header, signature)
      ) &&
      (file.type !== 'image/webp' ||
        String.fromCharCode(...header.slice(8, 12)) === 'WEBP')
    if (!valid)
      return {
        ok: false,
        error: 'Содержимое изображения не соответствует его типу',
      }
  }
  return { ok: true }
}

export const validateSupportText = ({
  title,
  body,
  category,
  requireTitle,
}) => {
  const normalizedBody = String(body || '').trim()
  const normalizedTitle = String(title || '').trim()
  if (!normalizedBody || normalizedBody.length > SUPPORT_MAX_BODY)
    return {
      ok: false,
      error: 'Сообщение должно содержать от 1 до 5000 символов',
    }
  if (
    requireTitle &&
    (!normalizedTitle || normalizedTitle.length > SUPPORT_MAX_TITLE)
  )
    return { ok: false, error: 'Тема должна содержать от 1 до 160 символов' }
  if (requireTitle && !SUPPORT_CATEGORIES.has(category))
    return { ok: false, error: 'Некорректный тип обращения' }
  return { ok: true, body: normalizedBody, title: normalizedTitle, category }
}

export const serializeSupportTicket = (ticket, developer = false) => ({
  id: String(ticket._id),
  tenantId: developer ? String(ticket.tenantId) : undefined,
  createdBy: developer ? String(ticket.createdBy) : undefined,
  createdByLabel: ticket.createdByLabel || '',
  category: ticket.category,
  title: ticket.title,
  status: ticket.status,
  lastMessageAt: ticket.lastMessageAt,
  lastMessageByRole: ticket.lastMessageByRole,
  unread: developer
    ? ticket.lastMessageByRole === 'user' &&
      (!ticket.developerLastReadAt ||
        ticket.developerLastReadAt < ticket.lastMessageAt)
    : ticket.lastMessageByRole === 'developer' &&
      (!ticket.userLastReadAt || ticket.userLastReadAt < ticket.lastMessageAt),
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
})

export const serializeSupportMessage = (message) => ({
  id: String(message._id),
  authorId: String(message.authorId),
  authorRole: message.authorRole,
  authorLabel: message.authorLabel || '',
  body: message.body,
  attachments: message.attachments || [],
  createdAt: message.createdAt,
})

export const buildSupportReplyTicketUpdate = ({
  actorRole,
  currentStatus,
  now = new Date(),
}) => ({
  lastMessageAt: now,
  lastMessageByRole: actorRole,
  ...(actorRole === 'user'
    ? { userLastReadAt: now }
    : { developerLastReadAt: now }),
  ...(actorRole === 'user' && currentStatus === 'resolved'
    ? { status: 'open', resolvedAt: null }
    : {}),
})

export const buildSupportNotificationPayload = ({
  ticket,
  actorRole,
  isNewTicket = false,
}) => {
  const id = String(ticket._id)

  return {
    title:
      actorRole === 'developer'
        ? isNewTicket
          ? 'Новое обращение от Ведело'
          : 'Ответ разработчика'
        : 'Новое обращение в поддержку',
    body: ticket.title,
    tag: `support-ticket-${id}`,
    data: {
      type: 'support_ticket',
      ticketId: id,
      url: `/cabinet/feedback?ticketId=${id}`,
      mobileUrl: `/support/${id}`,
    },
  }
}
