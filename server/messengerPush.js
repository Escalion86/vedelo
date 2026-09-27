import Clients from '@models/Clients'
import Events from '@models/Events'
import TelegramConversations from '@models/TelegramConversations'
import VkConversations from '@models/VkConversations'
import AvitoConversations from '@models/AvitoConversations'
import getPersonFullName from '@helpers/getPersonFullName'
import { buildIncomingMessagePushPayload } from '@helpers/incomingMessageNotification'
import { sendPushToTenant } from '@server/pushNotifications'
import { sendExpoPushToTenant } from '@server/expoPushNotifications'
import { aggregatePushResults } from './pushResultAggregation.js'
import { shouldSendExpoPushForConversation } from './messengerPushThrottle.js'

const CONVERSATION_MODELS = {
  telegram: TelegramConversations,
  vk: VkConversations,
  avito: AvitoConversations,
}

const resolveNearestClientEvent = async ({
  tenantId,
  clientId,
  associatedEvent,
  associatedEventId,
}) => {
  if (clientId) {
    const nearestEvent = await Events.findOne({
      tenantId,
      clientId,
      status: { $nin: ['canceled', 'closed'] },
      eventDate: { $gte: new Date() },
    })
      .sort({ eventDate: 1, createdAt: 1 })
      .select('_id eventType eventDate')
      .lean()
    if (nearestEvent) return nearestEvent
  }

  if (associatedEvent?._id) {
    return {
      _id: associatedEvent._id,
      eventType: associatedEvent.eventType,
      eventDate: associatedEvent.eventDate,
    }
  }

  if (associatedEventId) {
    return Events.findOne({ _id: associatedEventId, tenantId })
      .select('_id eventType eventDate')
      .lean()
  }

  return null
}

const resolveClientName = async ({ tenantId, clientId, fallback }) => {
  if (!clientId) return fallback || 'Клиент'
  const client = await Clients.findOne({ _id: clientId, tenantId })
    .select('firstName secondName thirdName')
    .lean()
  return getPersonFullName(client, { fallback: fallback || 'Клиент' })
}

const resolveClientMessageContext = async ({
  tenantId,
  clientId,
  clientName,
  associatedEvent,
  associatedEventId,
}) => {
  const [resolvedClientName, nearestEvent] = await Promise.all([
    resolveClientName({ tenantId, clientId, fallback: clientName }),
    resolveNearestClientEvent({
      tenantId,
      clientId,
      associatedEvent,
      associatedEventId,
    }),
  ])
  return { clientName: resolvedClientName, event: nearestEvent }
}

const isClientMessengerPushMuted = async ({ tenantId, clientId }) => {
  if (!tenantId || !clientId) return false
  const client = await Clients.findOne({ _id: clientId, tenantId })
    .select('messengerPushMuted')
    .lean()
  return client?.messengerPushMuted === true
}

export const notifyIncomingClientMessage = async ({
  tenantId,
  provider,
  messageId,
  messageText,
  clientId,
  clientName,
  associatedEvent,
  associatedEventId,
  conversationId,
  unreadCount = 0,
}) => {
  if (!tenantId || !provider) return null
  if (await isClientMessengerPushMuted({ tenantId, clientId })) {
    return { suppressed: true, reason: 'client_messenger_push_muted' }
  }

  const context = await resolveClientMessageContext({
    tenantId,
    clientId,
    clientName,
    associatedEvent,
    associatedEventId,
  })
  const payloadOptions = {
    provider,
    messageId,
    messageText,
    clientId,
    clientName: context.clientName,
    event: context.event,
    conversationId,
    unreadCount,
  }
  const payload = buildIncomingMessagePushPayload(payloadOptions)
  // Installed Android versions do not handle the web openMessenger parameter.
  const expoPayload = buildIncomingMessagePushPayload({
    ...payloadOptions,
    target: 'mobile',
  })

  const ConversationModel = CONVERSATION_MODELS[provider] || null
  let expoAllowed = true
  if (ConversationModel && conversationId) {
    const conversation = await ConversationModel.findOne({
      _id: conversationId,
      tenantId,
    })
      .select('lastPushAt')
      .lean()
    expoAllowed = shouldSendExpoPushForConversation({
      lastPushAt: conversation?.lastPushAt,
    })
    if (expoAllowed) {
      await ConversationModel.updateOne(
        { _id: conversationId, tenantId },
        { $set: { lastPushAt: new Date() } }
      )
    }
  }

  const [web, expo] = await Promise.all([
    sendPushToTenant({ tenantId, payload, source: `messenger_${provider}` }),
    expoAllowed
      ? sendExpoPushToTenant({ tenantId, payload: expoPayload })
      : Promise.resolve(null),
  ])
  return aggregatePushResults(web, expo)
}

export {
  isClientMessengerPushMuted,
  resolveClientMessageContext,
  resolveNearestClientEvent,
}
