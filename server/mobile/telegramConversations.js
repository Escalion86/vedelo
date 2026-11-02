import TelegramConversations from '@models/TelegramConversations'
import TelegramMessages from '@models/TelegramMessages'
import dbConnect from '@server/dbConnect'
import { requireTenantIntegrationAccess } from '@server/integrationAccess'
import { isTelegramReplyWindowOpen } from '@server/telegramBusiness'
import { sendTelegramConversationReply } from '@server/telegramConversationReply'
import { mobileError, mobileSuccess } from './routeHelpers'
import { serializeMobileConversation, serializeMobileConversationMessage } from './conversations'

const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
const dto = conversation => ({ ...serializeMobileConversation(conversation), provider: 'telegram', canReply: isTelegramReplyWindowOpen(conversation.lastIncomingAt) })

export const telegramConversations = async (req, { id, action = 'list' } = {}) => {
  const access = await requireTenantIntegrationAccess('telegram', req)
  if (!access.ok) return mobileError('TELEGRAM_ACCESS', access.error, access.status)
  const { tenantId } = access
  if (action !== 'list' && !validId(id)) return mobileError('BAD_ID', 'Некорректный ID переписки', 400)
  await dbConnect()
  if (action === 'list') {
    const filter = { tenantId }
    const params = new URL(req.url).searchParams
    for (const key of ['clientId', 'eventId']) if (params.has(key)) {
      if (!validId(params.get(key))) return mobileError('BAD_ID', 'Некорректная связанная запись', 400)
      filter[key] = params.get(key)
    }
    const rows = await TelegramConversations.find(filter).sort({ lastMessageAt: -1, _id: -1 }).limit(100).lean()
    return mobileSuccess(rows.map(dto))
  }
  const scope = { _id: id, tenantId }
  const conversation = await TelegramConversations.findOne(scope).lean()
  if (!conversation) return mobileError('NOT_FOUND', 'Переписка не найдена', 404)
  if (action === 'history') {
    const messages = await TelegramMessages.find({ conversationId: id, tenantId }).sort({ sentAt: -1, _id: -1 }).limit(300).lean()
    return mobileSuccess({ conversation: dto(conversation), messages: messages.reverse().map(serializeMobileConversationMessage) })
  }
  const body = await req.json().catch(() => null)
  if (!body || Array.isArray(body)) return mobileError('BAD_BODY', 'Некорректный запрос', 400)
  if (action === 'send') {
    if (Object.keys(body).some(key => key !== 'text') || typeof body.text !== 'string' || !body.text.trim() || body.text.trim().length > 4000) return mobileError('BAD_TEXT', 'Введите сообщение до 4000 символов', 400)
    try {
      const message = await sendTelegramConversationReply({ tenantId, conversationId: id, text: body.text.trim() })
      return mobileSuccess({ message: serializeMobileConversationMessage(message) }, 201)
    } catch (error) {
      return mobileError(error.code || 'UNCONFIRMED', error.status ? error.message : 'Результат отправки неизвестен. Обновите историю перед повтором.', error.status || 500)
    }
  }
  if (Object.keys(body).some(key => !['status', 'markRead'].includes(key)) ||
    body.status !== undefined && !['open', 'closed', 'ignored'].includes(body.status) ||
    body.markRead !== undefined && body.markRead !== true || !Object.keys(body).length) return mobileError('BAD_PATCH', 'Некорректное действие с перепиской', 400)
  const update = { ...(body.status ? { status: body.status } : {}), ...(body.markRead ? { unreadCount: 0, lastPushAt: null } : {}) }
  const saved = await TelegramConversations.findOneAndUpdate(scope, { $set: update }, { returnDocument: 'after' }).lean()
  return saved ? mobileSuccess(dto(saved)) : mobileError('NOT_FOUND', 'Переписка не найдена', 404)
}
