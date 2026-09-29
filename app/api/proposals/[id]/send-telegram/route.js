import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import Proposals from '@models/Proposals'
import TelegramConversations from '@models/TelegramConversations'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  canUseProposalBuilder,
  PROPOSAL_BUILDER_ACCESS_ERROR,
} from '@helpers/proposalAccess'
import {
  isTelegramReplyWindowOpen,
  normalizeTelegramSettings,
  saveTelegramBusinessMessage,
  sendTelegramBusinessMedia,
  sendTelegramBusinessMessage,
} from '@server/telegramBusiness'
import {
  buildProposalPublicUrl,
  renderProposalMessage,
} from '@server/proposals'

const error = (message, status = 400, code = 'bad_request', data = undefined) =>
  NextResponse.json(
    { success: false, error: { code, message }, ...(data ? { data } : {}) },
    { status }
  )

export const POST = async (req, { params }) => {
  const { id } = await params
  const { tenantId, user } = await getTenantContext()
  if (!tenantId || !user?._id)
    return error('Не авторизован', 401, 'unauthorized')
  if (!mongoose.Types.ObjectId.isValid(id))
    return error('Некорректный ID', 400, 'bad_id')
  const access = await getUserTariffAccess(user._id)
  if (!canUseProposalBuilder(access))
    return error(
      PROPOSAL_BUILDER_ACCESS_ERROR,
      403,
      'proposal_tariff_required'
    )
  if (!access?.allowTelegramIntegration)
    return error(
      'Интеграция Telegram недоступна на текущем тарифе',
      403,
      'telegram_tariff_required'
    )
  await dbConnect()
  const proposal = await Proposals.findOne({ _id: id, tenantId })
  if (!proposal || proposal.status !== 'published')
    return error(
      'Опубликуйте предложение перед отправкой',
      409,
      'not_published'
    )
  const [siteSettings, conversation] = await Promise.all([
    SiteSettings.findOne({ tenantId }).lean(),
    TelegramConversations.findOne({
      tenantId,
      $or: [
        { eventId: proposal.eventId },
        ...(proposal.clientId ? [{ clientId: proposal.clientId }] : []),
      ],
    }).sort({ lastIncomingAt: -1 }),
  ])
  if (!conversation)
    return error(
      'У клиента нет связанного диалога Telegram',
      404,
      'conversation_not_found'
    )
  if (!isTelegramReplyWindowOpen(conversation.lastIncomingAt))
    return error(
      'Окно ответа Telegram истекло. Клиент должен написать снова.',
      409,
      'reply_window_closed'
    )
  const settings = normalizeTelegramSettings(siteSettings?.custom)
  if (!settings.enabled || !settings.botToken || !settings.businessConnectionId)
    return error('Telegram Business не подключен', 403, 'not_connected')
  if (settings.rights?.can_reply === false)
    return error('Боту не выдано право отвечать', 403, 'reply_not_allowed')

  const origin = process.env.DOMAIN || req.nextUrl.origin
  const requestBody = await req.json().catch(() => ({}))
  const retryFailedOnly = requestBody?.retryFailedOnly === true
  const latestDelivery = new Map()
  for (const item of proposal.delivery || []) {
    latestDelivery.set(item.mediaId || item.type, item.status)
  }
  const publicUrl = buildProposalPublicUrl(proposal, origin)
  const externalLinks = proposal.mediaSnapshot
    .filter((item) => item.kind === 'video_link')
    .map((item) => item.url)
  const text = [renderProposalMessage(proposal, publicUrl), ...externalLinks]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 4000)
  const delivery = []
  try {
    if (retryFailedOnly && latestDelivery.get('text') === 'sent')
      throw Object.assign(new Error('skip_text'), { skip: true })
    const sentText = await sendTelegramBusinessMessage({
      botToken: settings.botToken,
      businessConnectionId: settings.businessConnectionId,
      chatId: conversation.telegramChatId,
      text,
    })
    await saveTelegramBusinessMessage({ tenantId, settings, message: sentText })
    delivery.push({
      type: 'text',
      status: 'sent',
      telegramMessageId: String(sentText.message_id || ''),
      sentAt: new Date(),
    })
  } catch (sendError) {
    if (sendError?.skip) {
      // Текст уже доставлен: при повторе отправляем только недоставленные медиа.
    } else {
      delivery.push({
        type: 'text',
        status: 'failed',
        error: String(sendError.message || '').slice(0, 300),
        sentAt: new Date(),
      })
      proposal.delivery.push(...delivery)
      await proposal.save()
      return error('Telegram не принял сообщение', 400, 'text_send_failed', {
        delivery,
      })
    }
  }

  const media = proposal.mediaSnapshot
    .filter((item) => item.kind === 'image' || item.kind === 'video')
    .map((item) => ({ id: item.id, type: item.kind, url: item.url }))
    .filter(
      (item) => !retryFailedOnly || latestDelivery.get(item.id) !== 'sent'
    )
  if (media.length) {
    try {
      const sentItems = await sendTelegramBusinessMedia({
        botToken: settings.botToken,
        businessConnectionId: settings.businessConnectionId,
        chatId: conversation.telegramChatId,
        media,
      })
      for (const sentMessage of sentItems)
        await saveTelegramBusinessMessage({
          tenantId,
          settings,
          message: sentMessage,
        })
      media.forEach((item, index) =>
        delivery.push({
          mediaId: item.id,
          type: item.type,
          status: 'sent',
          telegramMessageId: String(sentItems[index]?.message_id || ''),
          sentAt: new Date(),
        })
      )
    } catch (groupError) {
      for (const item of media) {
        try {
          const [sentMessage] = await sendTelegramBusinessMedia({
            botToken: settings.botToken,
            businessConnectionId: settings.businessConnectionId,
            chatId: conversation.telegramChatId,
            media: [item],
          })
          await saveTelegramBusinessMessage({
            tenantId,
            settings,
            message: sentMessage,
          })
          delivery.push({
            mediaId: item.id,
            type: item.type,
            status: 'sent',
            telegramMessageId: String(sentMessage?.message_id || ''),
            sentAt: new Date(),
          })
        } catch (itemError) {
          delivery.push({
            mediaId: item.id,
            type: item.type,
            status: 'failed',
            error: String(itemError.message || '').slice(0, 300),
            sentAt: new Date(),
          })
        }
      }
    }
  }
  proposal.sentAt = new Date()
  proposal.delivery.push(...delivery)
  await proposal.save()
  const failed = delivery.filter((item) => item.status === 'failed')
  if (failed.length)
    return error(
      `Сообщение отправлено, но ${failed.length} медиа не доставлено`,
      207,
      'partial_delivery',
      { delivery }
    )
  return NextResponse.json(
    { success: true, data: { delivery, sentAt: proposal.sentAt } },
    { status: 201 }
  )
}
