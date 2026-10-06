import type { Conversation, ConversationMessage, ConversationProvider } from '../../shared/domain/types'
import { optionalDate, optionalText, record, serverId, successfulData } from '../calls/communication'

export const conversationProvider = (value: unknown): value is ConversationProvider => value === 'avito' || value === 'vk'
// Both current delegated POST handlers trim and slice to 4000 characters.
export const messageLimit: Record<ConversationProvider, number> = { avito: 4000, vk: 4000 }
export const conversationStatus = (value?: Conversation['status']) => value === 'closed' ? 'Закрыт' : value === 'ignored' ? 'Игнорируется' : 'В работе'
export const checkedConversation = (value: unknown, provider: ConversationProvider, id?: string): Conversation => {
  if (!conversationProvider(provider) || !record(value) || !serverId(value._id) || id !== undefined && value._id !== id
    || value.provider !== undefined && value.provider !== provider
    || !['open', 'closed', 'ignored'].includes(String(value.status))
    || !Number.isFinite(value.unreadCount) || Number(value.unreadCount) < 0
    || [value.clientId, value.eventId].some((link) => link != null && !serverId(link))
    || ['clientName', 'avitoItemTitle', 'lastMessageText'].some((key) => !optionalText(value[key]))
    || !optionalDate(value.lastMessageAt)) throw new Error('invalid_conversation')
  return { ...value, provider } as Conversation
}
export const checkedMessage = (value: unknown): ConversationMessage => {
  if (!record(value) || !serverId(value._id) || !['incoming', 'outgoing'].includes(String(value.direction))
    || !['received', 'sent', 'failed'].includes(String(value.status)) || typeof value.text !== 'string' || !optionalDate(value.sentAt)) throw new Error('invalid_message')
  return value as ConversationMessage
}
export const conversationHistory = (response: unknown, provider: ConversationProvider, id: string) => {
  const data = successfulData(response)
  if (!record(data) || !Array.isArray(data.messages)) throw new Error('invalid_history')
  const conversation = checkedConversation(data.conversation, provider, id)
  const messages = data.messages.map(checkedMessage)
  if (new Set(messages.map((message) => message._id)).size !== messages.length) throw new Error('duplicate_messages')
  return { conversation, messages }
}
export const sentMessage = (response: unknown) => {
  const data = successfulData(response)
  const message = checkedMessage(record(data) ? data.message : null)
  if (message.direction !== 'outgoing' || message.status !== 'sent') throw new Error('not_sent')
  return message
}
export const confirmSentMessage = (messages: ConversationMessage[], id: string) => {
  const found = messages.find((message) => message._id === id)
  if (!found || found.direction !== 'outgoing' || found.status !== 'sent') throw new Error('unconfirmed_send')
  return found
}
