import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import TelegramMessages from '@models/TelegramMessages'
import dbConnect from '@server/dbConnect'
import { isTelegramQuestionnaireTestStart } from '@helpers/telegramQuestionnaireBlocks.mjs'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { hasIntegrationAccess, hasTelegramQuestionnaireAccess } from '@server/integrationAccess'
import { checkRateLimit, rateLimitResponse } from '@server/rateLimit'
import {
  buildTelegramWebhookUrl,
  normalizeTelegramSettings,
  saveTelegramBusinessMessage,
  updateTelegramCustom,
} from '@server/telegramBusiness'
import { notifyIncomingClientMessage } from '@server/messengerPush'
import {
  TELEGRAM_QUESTIONNAIRE_PREFIX,
  handleTelegramQuestionnaireCallback,
  handleTelegramQuestionnaireMessage,
  pauseTelegramQuestionnaire,
} from '@server/telegramQuestionnaire'
import { readTelegramQuestionnaire } from '@server/telegramQuestionnaireSettings'
import { readTelegramQuestionnaireTestRun } from '@server/telegramQuestionnaireTestRuns'

const jsonError = (message, status = 400, code = 'telegram_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'telegram_business', message } },
    { status }
  )

export const POST = async (req, { params }) => {
  const routeParams = await params
  const token = String(routeParams?.token || '').trim()
  if (!token) return jsonError('Token required', 400, 'missing_token')

  const limit = await checkRateLimit({
    req,
    scope: 'telegram_business_webhook',
    limit: 500,
    windowMs: 10 * 60 * 1000,
    keyParts: [token],
  })
  if (!limit.ok) return rateLimitResponse(NextResponse, limit)

  await dbConnect()
  const siteSettings = await SiteSettings.findOne({
    'custom.telegramBusinessWebhookToken': token,
  })
  if (!siteSettings?.tenantId) return jsonError('Forbidden', 403, 'forbidden')

  const settings = normalizeTelegramSettings(siteSettings.custom)
  const requestSecret = String(
    req.headers.get('x-telegram-bot-api-secret-token') || ''
  )
  if (!settings.webhookSecret || requestSecret !== settings.webhookSecret) {
    return jsonError('Forbidden', 403, 'bad_secret')
  }
  if (!settings.enabled) return jsonError('Integration disabled', 403, 'disabled')

  const tariffAccess = await getUserTariffAccess(siteSettings.tenantId)
  if (!hasIntegrationAccess(tariffAccess, 'telegram')) {
    return jsonError('Telegram integration is unavailable', 403, 'tariff_required')
  }
  const questionnaireAllowed = hasTelegramQuestionnaireAccess(tariffAccess)

  const body = await req.json().catch(() => ({}))
  const now = new Date().toISOString()
  const { tenantId } = siteSettings
  const connection = body?.business_connection
  if (connection) {
    await updateTelegramCustom({
      tenantId: siteSettings.tenantId,
      patch: {
        telegramBusinessConnectionId: connection?.is_enabled
          ? String(connection.id || '')
          : '',
        telegramBusinessAccountUserId: connection?.is_enabled
          ? String(connection?.user?.id || '')
          : '',
        telegramBusinessRights: connection?.rights || null,
        telegramBusinessStatus: connection?.is_enabled
          ? 'connected'
          : 'bot_ready',
        telegramBusinessConnectedAt: connection?.is_enabled ? now : null,
        telegramBusinessLastWebhookAt: now,
        telegramBusinessLastError: '',
      },
    })
    return NextResponse.json({ ok: true })
  }

  if (body?.callback_query) {
    const data = body.callback_query.data
    if (questionnaireAllowed && typeof data === 'string' && data.startsWith(TELEGRAM_QUESTIONNAIRE_PREFIX)) {
      const questionnaire = await readTelegramQuestionnaire(tenantId)
      const testRun = await readTelegramQuestionnaireTestRun({
        tenantId, questionnaire, businessConnectionId: settings.businessConnectionId,
        telegramChatId: body.callback_query.message?.chat?.id,
      })
      await handleTelegramQuestionnaireCallback({
        tenantId,
        settings: { ...settings, webhookUrl: settings.webhookUrl || buildTelegramWebhookUrl({ req, token }), questionnaire },
        callbackQuery: body.callback_query,
        testRun,
      })
    }
    return NextResponse.json({ ok: true })
  }

  const message = body?.business_message || body?.edited_business_message
  if (message) {
    if (settings.businessConnectionId && settings.businessConnectionId !== message.business_connection_id) {
      return NextResponse.json({ ok: true })
    }
    const effectiveSettings = {
      ...settings,
      businessConnectionId:
        settings.businessConnectionId || message.business_connection_id,
    }
    const result = await saveTelegramBusinessMessage({
      tenantId,
      settings: effectiveSettings,
      message,
      canStartQuestionnaire: questionnaireAllowed && Boolean(body.business_message),
    })
    const notify = () => notifyIncomingClientMessage({
      tenantId,
      provider: 'telegram',
      messageId: String(message.message_id || ''),
      messageText: result.message?.text || '',
      clientId: result.client?._id || result.conversation?.clientId,
      clientName: result.conversation?.clientName || '',
      associatedEventId: result.conversation?.eventId,
      conversationId: result.conversation?._id,
      unreadCount: result.conversation?.unreadCount || 0,
    }).catch((error) => {
      console.error('Не удалось отправить push о сообщении Telegram', error)
    })
    if (result?.direction === 'incoming') {
      const canHandle = questionnaireAllowed && body.business_message && settings.businessConnectionId === message.business_connection_id
      const questionnaire = canHandle ? await readTelegramQuestionnaire(tenantId) : null
      const testRun = questionnaire?.enabled ? await readTelegramQuestionnaireTestRun({
        tenantId, questionnaire, businessConnectionId: settings.businessConnectionId, telegramChatId: message.chat?.id,
      }) : null
      const isTestStart = isTelegramQuestionnaireTestStart(testRun, message)
      if (result.isNewMessage && result.isFirstIncomingMessage && !isTestStart) await notify()
      const outcome = questionnaire?.enabled ? await handleTelegramQuestionnaireMessage({
        tenantId, settings: { ...settings, questionnaire }, message, result, testRun,
      }) : null

      if (result.isNewMessage && !result.isFirstIncomingMessage && !outcome?.suppressMessagePush) await notify()
    }
    if (questionnaireAllowed && body.business_message && result?.direction === 'outgoing' && message.chat?.type === 'private' &&
      settings.businessConnectionId && settings.businessAccountUserId &&
      String(message.from?.id) === settings.businessAccountUserId && !message.sender_business_bot &&
      !message.is_from_offline && Number.isSafeInteger(message.message_id) && message.message_id > 0) {
      await pauseTelegramQuestionnaire({
        tenantId, businessConnectionId: settings.businessConnectionId,
        chatId: message.chat.id, messageId: message.message_id,
      })
    }
    await updateTelegramCustom({
      tenantId: siteSettings.tenantId,
      patch: {
        telegramBusinessConnectionId: String(
          message.business_connection_id || settings.businessConnectionId || ''
        ),
        telegramBusinessStatus: 'connected',
        telegramBusinessLastWebhookAt: now,
        telegramBusinessLastMessageAt: result ? now : settings.lastMessageAt,
        telegramBusinessLastError: '',
      },
    })
    return NextResponse.json({ ok: true })
  }

  const deleted = body?.deleted_business_messages
  if (deleted?.chat?.id && Array.isArray(deleted?.message_ids) &&
    (!settings.businessConnectionId || settings.businessConnectionId === deleted.business_connection_id)) {
    await TelegramMessages.deleteMany({
      tenantId: siteSettings.tenantId,
      telegramChatId: String(deleted.chat.id),
      telegramMessageId: { $in: deleted.message_ids.map(String) },
    })
  }
  await updateTelegramCustom({
    tenantId: siteSettings.tenantId,
    patch: { telegramBusinessLastWebhookAt: now },
  })
  return NextResponse.json({ ok: true })
}
