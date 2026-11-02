import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import AvitoConversations from '@models/AvitoConversations'
import AvitoMessages from '@models/AvitoMessages'
import Calls from '@models/Calls'
import VkConversations from '@models/VkConversations'
import VkMessages from '@models/VkMessages'
import TelegramConversations from '@models/TelegramConversations'
import TelegramMessages from '@models/TelegramMessages'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  getIntegrationAccessError,
  hasIntegrationAccess,
} from '@server/integrationAccess'
import {
  normalizeAvitoSettings,
  requestAvitoAccessToken,
  sendAvitoMessage,
} from '@server/avito'
import { normalizeVkSettings, sendVkMessage } from '@server/vkGroup'
import {
  isTelegramReplyWindowOpen,
} from '@server/telegramBusiness'
import { sendTelegramConversationReply } from '@server/telegramConversationReply'

const isObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)))

const jsonError = (message, status = 400, code = 'messenger_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'messenger', message } },
    { status }
  )

const normalizeConversation = (provider, conversation) => ({
  _id: String(conversation._id),
  provider,
  providerLabel:
    provider === 'avito'
      ? 'Avito'
      : provider === 'vk'
        ? 'VK'
        : provider === 'telegram'
          ? 'Telegram'
          : 'Novofon',
  clientId: conversation.clientId ? String(conversation.clientId) : '',
  eventId: conversation.eventId ? String(conversation.eventId) : '',
  lastMessageText: conversation.lastMessageText || '',
  lastMessageAt: conversation.lastMessageAt || null,
  unreadCount: conversation.unreadCount || 0,
  canReply:
    provider !== 'telegram' ||
    isTelegramReplyWindowOpen(conversation.lastIncomingAt),
  replyWindowClosesAt:
    provider === 'telegram' && conversation.lastIncomingAt
      ? new Date(
          new Date(conversation.lastIncomingAt).getTime() + 24 * 60 * 60 * 1000
        )
      : null,
})

const normalizeMessage = (provider, message) => ({
  _id: String(message._id),
  conversationId: String(message.conversationId),
  provider,
  providerLabel:
    provider === 'avito'
      ? 'Avito'
      : provider === 'vk'
        ? 'VK'
        : provider === 'telegram'
          ? 'Telegram'
          : 'Novofon',
  direction: message.direction,
  text: message.text || '',
  attachments: Array.isArray(message.attachments) ? message.attachments : [],
  sentAt: message.sentAt || message.createdAt || null,
  createdAt: message.createdAt || null,
  status: message.status || '',
})

const formatCallMessageText = (call) => {
  const direction =
    call.direction === 'outgoing'
      ? 'Исходящий звонок'
      : call.direction === 'incoming'
        ? 'Входящий звонок'
        : 'Звонок'
  const parts = [direction]
  if (call.phone || call.normalizedPhone) {
    parts.push(`Номер: ${call.phone || call.normalizedPhone}`)
  }
  if (call.durationSec) parts.push(`Длительность: ${call.durationSec} сек.`)
  if (call.aiSummary) parts.push(`AI-резюме:\n${call.aiSummary}`)
  if (call.transcript) parts.push(`Transcript:\n${call.transcript}`)
  if (call.eventDecision === 'no_event') parts.push('Заявка из звонка не нужна')
  return parts.join('\n\n')
}

const normalizeCallConversation = ({ clientId, lastCall }) => ({
  _id: `novofon-${clientId}`,
  provider: 'novofon',
  providerLabel: 'Novofon',
  clientId: String(clientId || ''),
  eventId: '',
  lastMessageText: lastCall?.recordingUrl
    ? 'Запись звонка'
    : formatCallMessageText(lastCall),
  lastMessageAt: lastCall?.startedAt || lastCall?.createdAt || null,
  unreadCount: 0,
})

const normalizeCallMessage = (call, clientId) => ({
  _id: String(call._id),
  conversationId: `novofon-${clientId}`,
  provider: 'novofon',
  providerLabel: 'Novofon',
  direction: call.direction === 'outgoing' ? 'outgoing' : 'incoming',
  text: formatCallMessageText(call),
  attachments: call.recordingUrl
    ? [
        {
          audioUrl: call.recordingUrl,
          title: 'Запись звонка Novofon',
        },
      ]
    : [],
  sentAt: call.startedAt || call.createdAt || null,
  createdAt: call.createdAt || null,
  status: call.status || '',
})

const loadClientMessenger = async ({
  tenantId,
  clientId,
  access,
  summary = false,
}) => {
  const [avitoConversations, vkConversations, telegramConversations] =
    await Promise.all([
    hasIntegrationAccess(access, 'avito')
      ? AvitoConversations.find({ tenantId, clientId })
          .sort({ lastMessageAt: -1, updatedAt: -1 })
          .limit(100)
          .lean()
      : Promise.resolve([]),
    hasIntegrationAccess(access, 'vk')
      ? VkConversations.find({ tenantId, clientId })
          .sort({ lastMessageAt: -1, updatedAt: -1 })
          .limit(100)
          .lean()
      : Promise.resolve([]),
    hasIntegrationAccess(access, 'telegram')
      ? TelegramConversations.find({ tenantId, clientId })
          .sort({ lastMessageAt: -1, updatedAt: -1 })
          .limit(100)
          .lean()
      : Promise.resolve([]),
  ])
  const calls = hasIntegrationAccess(access, 'telephony')
    ? await Calls.find({ tenantId, linkedClientId: clientId })
        .sort({ startedAt: -1, createdAt: -1 })
        .limit(100)
        .lean()
    : []
  const callConversation =
    calls.length > 0
      ? normalizeCallConversation({ clientId, lastCall: calls[0] })
      : null

  const conversations = [
    ...avitoConversations.map((item) => normalizeConversation('avito', item)),
    ...vkConversations.map((item) => normalizeConversation('vk', item)),
    ...telegramConversations.map((item) =>
      normalizeConversation('telegram', item)
    ),
    callConversation,
  ].filter(Boolean).sort(
    (a, b) =>
      new Date(b.lastMessageAt || 0).getTime() -
      new Date(a.lastMessageAt || 0).getTime()
  )

  if (summary) {
    return {
      conversations,
      messages: [],
      defaultConversationId: conversations[0]?._id || '',
      defaultProvider: conversations[0]?.provider || '',
    }
  }

  const [avitoMessages, vkMessages, telegramMessages] = await Promise.all([
    avitoConversations.length
      ? AvitoMessages.find({
          tenantId,
          conversationId: { $in: avitoConversations.map((item) => item._id) },
        })
          .sort({ sentAt: 1, createdAt: 1 })
          .limit(500)
          .lean()
      : Promise.resolve([]),
    vkConversations.length
      ? VkMessages.find({
          tenantId,
          conversationId: { $in: vkConversations.map((item) => item._id) },
        })
          .sort({ sentAt: 1, createdAt: 1 })
          .limit(500)
          .lean()
      : Promise.resolve([]),
    telegramConversations.length
      ? TelegramMessages.find({
          tenantId,
          conversationId: {
            $in: telegramConversations.map((item) => item._id),
          },
        })
          .sort({ sentAt: 1, createdAt: 1 })
          .limit(500)
          .lean()
      : Promise.resolve([]),
  ])

  const messages = [
    ...avitoMessages.map((item) => normalizeMessage('avito', item)),
    ...vkMessages.map((item) => normalizeMessage('vk', item)),
    ...telegramMessages.map((item) => normalizeMessage('telegram', item)),
    ...calls.map((item) => normalizeCallMessage(item, clientId)),
  ].sort(
    (a, b) =>
      new Date(a.sentAt || a.createdAt || 0).getTime() -
      new Date(b.sentAt || b.createdAt || 0).getTime()
  )

  const lastIncoming = [...messages]
    .reverse()
    .find((item) => item.direction === 'incoming')
  const lastAny = messages[messages.length - 1]

  return {
    conversations,
    messages,
    defaultConversationId:
      lastIncoming?.conversationId || lastAny?.conversationId || conversations[0]?._id || '',
    defaultProvider:
      lastIncoming?.provider || lastAny?.provider || conversations[0]?.provider || '',
  }
}

export const GET = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const clientId = String(routeParams?.id || '').trim()
  if (!isObjectId(clientId)) return jsonError('Некорректный ID клиента', 400, 'bad_id')

  const { searchParams } = new URL(req.url)
  const summary = searchParams.get('summary') === '1'

  await dbConnect()
  const access = await getUserTariffAccess(tenantId)
  const data = await loadClientMessenger({
    tenantId,
    clientId,
    access,
    summary,
  })

  return NextResponse.json({ success: true, data }, { status: 200 })
}

export const PATCH = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const clientId = String(routeParams?.id || '').trim()
  if (!isObjectId(clientId)) {
    return jsonError('Некорректный ID клиента', 400, 'bad_id')
  }

  await dbConnect()
  const access = await getUserTariffAccess(tenantId)
  await Promise.all([
    hasIntegrationAccess(access, 'avito')
      ? AvitoConversations.updateMany(
          { tenantId, clientId, unreadCount: { $gt: 0 } },
          { $set: { unreadCount: 0, lastPushAt: null } }
        )
      : Promise.resolve(),
    hasIntegrationAccess(access, 'vk')
      ? VkConversations.updateMany(
          { tenantId, clientId, unreadCount: { $gt: 0 } },
          { $set: { unreadCount: 0, lastPushAt: null } }
        )
      : Promise.resolve(),
    hasIntegrationAccess(access, 'telegram')
      ? TelegramConversations.updateMany(
          { tenantId, clientId, unreadCount: { $gt: 0 } },
          { $set: { unreadCount: 0, lastPushAt: null } }
        )
      : Promise.resolve(),
  ])

  const data = await loadClientMessenger({ tenantId, clientId, access })
  return NextResponse.json({ success: true, data }, { status: 200 })
}

export const POST = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const clientId = String(routeParams?.id || '').trim()
  if (!isObjectId(clientId)) return jsonError('Некорректный ID клиента', 400, 'bad_id')

  const body = await req.json().catch(() => ({}))
  const provider = String(body?.provider || '').trim().toLowerCase()
  const conversationId = String(body?.conversationId || '').trim()
  const text = String(body?.text || '').trim().slice(0, 4000)

  if (!['avito', 'vk', 'telegram'].includes(provider)) {
    return jsonError('Выберите чат для ответа', 400, 'bad_provider')
  }
  if (!isObjectId(conversationId)) {
    return jsonError('Некорректный ID переписки', 400, 'bad_conversation_id')
  }
  if (!text) return jsonError('Введите текст сообщения', 400, 'empty_text')

  await dbConnect()
  const access = await getUserTariffAccess(tenantId)
  if (!hasIntegrationAccess(access, provider)) {
    return jsonError(
      getIntegrationAccessError(provider),
      403,
      'tariff_required'
    )
  }

  if (provider === 'avito') {
    const conversation = await AvitoConversations.findOne({
      _id: conversationId,
      tenantId,
      clientId,
    })
    if (!conversation) return jsonError('Переписка Avito не найдена', 404, 'not_found')

    const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
    const avito = normalizeAvitoSettings(siteSettings?.custom)
    if (!avito.enabled || !avito.clientId || !avito.clientSecret) {
      return jsonError('Avito не подключен', 403, 'not_connected')
    }
    if (!avito.userId) {
      return jsonError('Укажите Avito User ID в настройках интеграции', 400, 'missing_user_id')
    }

    let sendResult = null
    try {
      const tokenPayload = await requestAvitoAccessToken({
        clientId: avito.clientId,
        clientSecret: avito.clientSecret,
      })
      sendResult = await sendAvitoMessage({
        accessToken: tokenPayload.access_token,
        userId: avito.userId,
        chatId: conversation.avitoChatId,
        text,
      })
    } catch (error) {
      return jsonError('Не удалось получить доступ Avito', 400, 'auth_error')
    }

    const now = new Date()
    const message = await AvitoMessages.create({
      tenantId,
      conversationId: conversation._id,
      clientId: conversation.clientId ?? null,
      eventId: conversation.eventId ?? null,
      avitoChatId: conversation.avitoChatId,
      avitoMessageId:
        sendResult?.payload?.id || sendResult?.payload?.message_id || '',
      direction: 'outgoing',
      text,
      sentAt: now,
      status: sendResult?.ok ? 'sent' : 'failed',
      raw: sendResult?.payload ?? null,
    })

    conversation.lastMessageText = text
    conversation.lastMessageAt = now
    await conversation.save()

    if (!sendResult?.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'send_failed',
            type: 'messenger',
            message: sendResult?.error || 'Avito не принял сообщение',
          },
          data: { message: normalizeMessage('avito', message) },
        },
        { status: 400 }
      )
    }

    const data = await loadClientMessenger({ tenantId, clientId, access })
    return NextResponse.json({ success: true, data }, { status: 201 })
  }

  if (provider === 'telegram') {
    try {
      await sendTelegramConversationReply({ tenantId, conversationId, clientId, text })
    } catch (error) {
      return jsonError(error.status ? error.message : 'Не удалось сохранить ответ Telegram', error.status || 500, error.code || 'save_failed')
    }
    const data = await loadClientMessenger({ tenantId, clientId, access })
    return NextResponse.json({ success: true, data }, { status: 201 })
  }

  const conversation = await VkConversations.findOne({
    _id: conversationId,
    tenantId,
    clientId,
  })
  if (!conversation) return jsonError('Переписка VK не найдена', 404, 'not_found')

  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const vkGroup = normalizeVkSettings(siteSettings?.custom)
  if (!vkGroup.enabled || !vkGroup.accessToken) {
    return jsonError('VK-группа не подключена', 403, 'not_connected')
  }

  const sendResult = await sendVkMessage({
    accessToken: vkGroup.accessToken,
    peerId: conversation.vkPeerId,
    text,
  })

  const now = new Date()
  const message = await VkMessages.create({
    tenantId,
    conversationId: conversation._id,
    clientId: conversation.clientId ?? null,
    eventId: conversation.eventId ?? null,
    vkPeerId: conversation.vkPeerId,
    vkMessageId: sendResult?.payload ? String(sendResult.payload) : '',
    vkUserId: conversation.vkUserId || '',
    direction: 'outgoing',
    text,
    sentAt: now,
    status: sendResult?.ok ? 'sent' : 'failed',
    raw: sendResult?.payload ?? null,
  })

  conversation.lastMessageText = text
  conversation.lastMessageAt = now
  await conversation.save()

  if (!sendResult?.ok) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'send_failed',
          type: 'messenger',
          message: sendResult?.error || 'VK не принял сообщение',
        },
        data: { message: normalizeMessage('vk', message) },
      },
      { status: 400 }
    )
  }

  const data = await loadClientMessenger({ tenantId, clientId, access })
  return NextResponse.json({ success: true, data }, { status: 201 })
}
