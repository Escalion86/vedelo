import TelegramConversations from '@models/TelegramConversations'
import SiteSettings from '@models/SiteSettings'
import { isTelegramReplyWindowOpen, normalizeTelegramSettings, saveTelegramBusinessMessage, sendTelegramBusinessMessage } from '@server/telegramBusiness'

const fail = (status, code, message) => Object.assign(new Error(message), { status, code })

// Authentication and the Telegram tariff are checked by both callers before this operation.
export const sendTelegramConversationReply = async ({ tenantId, conversationId, clientId, text }) => {
  const conversation = await TelegramConversations.findOne({ _id: conversationId, tenantId, ...(clientId ? { clientId } : {}) })
  if (!conversation) throw fail(404, 'not_found', 'Переписка Telegram не найдена')
  const settings = await SiteSettings.findOne({ tenantId }).lean()
  const telegram = normalizeTelegramSettings(settings?.custom)
  if (!telegram.enabled || !telegram.botToken || !telegram.businessConnectionId) throw fail(403, 'not_connected', 'Telegram Business не подключен')
  if (!isTelegramReplyWindowOpen(conversation.lastIncomingAt)) throw fail(400, 'reply_window_closed', 'Окно ответа Telegram истекло. Клиент должен сначала написать снова.')
  if (telegram.rights?.can_reply === false) throw fail(403, 'reply_not_allowed', 'Боту не выдано право отвечать на сообщения')
  let sent
  try {
    sent = await sendTelegramBusinessMessage({ botToken: telegram.botToken, businessConnectionId: telegram.businessConnectionId, chatId: conversation.telegramChatId, text })
  } catch {
    throw fail(400, 'send_failed', 'Telegram не принял сообщение. Проверьте подключение и окно ответа.')
  }
  const saved = await saveTelegramBusinessMessage({ tenantId, settings: telegram, message: sent })
  if (!saved?.message) throw fail(502, 'save_unconfirmed', 'Telegram принял сообщение, но его сохранение не подтверждено. Обновите историю перед повторной отправкой.')
  return saved.message
}
