import { checkedConversation, confirmSentMessage, conversationHistory, conversationProvider, messageLimit, sentMessage } from './conversationUi'
const id = '111111111111111111111111'
const conversation = { _id: id, status: 'open', unreadCount: 0 }
const message = { _id: '222222222222222222222222', direction: 'outgoing', status: 'sent', text: 'Ответ' }
it.each(['telegram', '', 'VK', 'avito/', ['vk'], undefined])('Y: provider %p не принимается', (value) => expect(conversationProvider(value)).toBe(false))
it('Y: реальные лимиты обоих API и DTO без обязательного conversationId', () => {
  expect(messageLimit).toEqual({ avito: 4000, vk: 4000 })
  expect(sentMessage({ success: true, data: { message } })).toEqual(message)
})
it('Y: exact conversation ID/provider и server links обязательны', () => {
  expect(() => checkedConversation(conversation, 'avito', '333333333333333333333333')).toThrow()
  expect(() => checkedConversation({ ...conversation, provider: 'vk' }, 'avito', id)).toThrow()
  expect(() => checkedConversation({ ...conversation, clientId: 'local-client' }, 'avito', id)).toThrow()
})
it.each([{ success: false, data: { message } }, { success: true, data: { message: { ...message, status: 'failed' } } }, { success: true, data: { message: { ...message, direction: 'incoming' } } }, { success: true, data: { message: { ...message, _id: '' } } }])('Y: непроверенный ответ не считается отправленным %p', (response) => expect(() => sentMessage(response)).toThrow())
it('Y: принадлежность через read-back exact message ID, без совпадения текста', () => {
  expect(() => confirmSentMessage([{ ...message, _id: id } as any], message._id)).toThrow()
  expect(confirmSentMessage([message as any], message._id)).toEqual(message)
  expect(() => confirmSentMessage([{ ...message, status: 'failed' } as any], message._id)).toThrow()
})
it('Y: history success:false, дубль ID и чужой route отклоняются', () => {
  expect(() => conversationHistory({ success: false, data: { conversation, messages: [] } }, 'vk', id)).toThrow()
  expect(() => conversationHistory({ success: true, data: { conversation, messages: [message, message] } }, 'vk', id)).toThrow()
  expect(() => conversationHistory({ success: true, data: { conversation: { ...conversation, _id: message._id }, messages: [] } }, 'vk', id)).toThrow()
})
