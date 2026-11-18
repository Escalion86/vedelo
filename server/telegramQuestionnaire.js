import { createHash, randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import Clients from '@models/Clients'
import Events from '@models/Events'
import SiteSettings from '@models/SiteSettings'
import TelegramConversations from '@models/TelegramConversations'
import TelegramQuestionnaires from '@models/TelegramQuestionnaires'
import { recordActivityHistory } from '@server/activityHistory'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { hasTelegramQuestionnaireAccess } from '@server/integrationAccess'
import { sendMultiChannelPushToTenant } from '@server/multiChannelPush'
import { sendTelegramQuestionnaireMedia } from '@server/telegramQuestionnaireMedia'
import {
  answerTelegramCallbackQuery,
  isTelegramReplyWindowOpen,
  saveTelegramBusinessMessage,
  sendTelegramBusinessMessage,
} from '@server/telegramBusiness'
import { buildPublicLeadInitialContactEvent } from './publicLeadPayload.mjs'
import {
  buildTelegramQuestionnairePrompt,
  getTelegramQuestionnaireCallbackStep,
  getTelegramQuestionnaireTextStep,
  questionnaireActiveSteps,
  readTelegramQuestionnaireCallback,
  snapshotTelegramQuestionnaire,
  TELEGRAM_QUESTIONNAIRE_PREFIX,
} from './telegramQuestionnaireSteps.mjs'

export { TELEGRAM_QUESTIONNAIRE_PREFIX }

dayjs.extend(utc)
dayjs.extend(timezone)

const ignored = { handled: false, suppressMessagePush: false }
const consumed = { handled: true, suppressMessagePush: true }
const seen = { handled: true, suppressMessagePush: false }
const deliveryLeaseMs = 60_000
const supportedTimeZone = 'Asia/Krasnoyarsk'
const randomToken = () => randomBytes(12).toString('hex')

const readMessageId = (value) => Number.isSafeInteger(value) && value > 0 ? value : 0

const sessionScope = (tenantId, businessConnectionId, chatId) => ({
  _id: createHash('sha256').update(JSON.stringify([String(tenantId), businessConnectionId, chatId])).digest('hex'),
  tenantId,
  businessConnectionId,
  telegramChatId: chatId,
})

const currentState = (session) => ({
  _id: session._id,
  tenantId: session.tenantId,
  businessConnectionId: session.businessConnectionId,
  telegramChatId: session.telegramChatId,
  step: session.step,
  revision: session.revision,
})

const canAutomate = ({ enabled, botToken, businessConnectionId, rights, questionnaire } = {}) =>
  enabled && botToken && businessConnectionId && (rights == null || rights.can_reply === true) && questionnaire?.enabled === true

const matchingConnection = (expected, actual) => actual == null || String(actual) === expected

const matchingConversation = (conversation, tenantId, connectionId, chatId) =>
  conversation?._id && String(conversation.tenantId) === String(tenantId) &&
  conversation.businessConnectionId === connectionId && conversation.telegramChatId === chatId

const clearDelivery = { deliveryToken: '', deliveryLeaseUntil: null }

const applyStep = (session, next, messageId = 0) => TelegramQuestionnaires.findOneAndUpdate(
  currentState(session),
  {
    $set: {
      ...clearDelivery,
      step: next.step,
      promptMessageId: 0,
      ...(next.resetAnswers ? { answers: {}, mediaAttempted: true } : {}),
      ...(next.answer ? Object.fromEntries(Object.entries(next.answer).map(([key, value]) => [`answers.${key}`, value])) : {}),
      ...(messageId ? { lastInputMessageId: messageId } : {}),
      ...(next.step === 'submitting' ? { submittedAt: new Date(), submittedFromMessageId: session.promptMessageId } : {}),
    },
    $inc: { revision: 1 },
  },
  { returnDocument: 'after' }
).lean()

const claimDelivery = (session) => {
  const now = new Date()
  return TelegramQuestionnaires.findOneAndUpdate(
    {
      ...currentState(session), promptMessageId: 0,
      $or: [{ deliveryLeaseUntil: null }, { deliveryLeaseUntil: { $lte: now } }],
    },
    { $set: { deliveryToken: randomToken(), deliveryLeaseUntil: new Date(now.getTime() + deliveryLeaseMs) } },
    { returnDocument: 'after' }
  ).lean()
}

const releaseDelivery = (session, values = {}) => TelegramQuestionnaires.updateOne(
  { ...currentState(session), deliveryToken: session.deliveryToken },
  { $set: { ...clearDelivery, ...values } }
)

const sendQuestionnaireText = async ({ session, settings, text, replyMarkup }) => {
  const sent = await sendTelegramBusinessMessage({
    botToken: settings.botToken, businessConnectionId: session.businessConnectionId,
    chatId: session.telegramChatId, text, replyMarkup,
  })
  const messageId = readMessageId(sent?.message_id)
  if (!messageId) throw new Error('Telegram не подтвердил отправку сообщения анкеты')
  await saveTelegramBusinessMessage({
    tenantId: session.tenantId, settings,
    message: { ...sent, business_connection_id: session.businessConnectionId },
  }).catch(() => {})
  return messageId
}

const sendPrompt = async ({ session, settings }) => {
  const prompt = buildTelegramQuestionnairePrompt(session)
  if (session.promptMessageId || !prompt) return
  const reserved = await claimDelivery(session)
  if (!reserved) return
  try {
    if (reserved.step === 'service' && !reserved.mediaAttempted && settings.questionnaire.media?.length) {
      const attempt = await TelegramQuestionnaires.updateOne(
        { ...currentState(reserved), deliveryToken: reserved.deliveryToken, mediaAttempted: false },
        { $set: { mediaAttempted: true } }
      )
      if (attempt.modifiedCount) {
        await sendTelegramQuestionnaireMedia({
          tenantId: reserved.tenantId, settings, chatId: reserved.telegramChatId, media: settings.questionnaire.media,
        }).catch(() => {})
      }
    }
    const active = await TelegramQuestionnaires.exists({
      ...currentState(reserved), deliveryToken: reserved.deliveryToken,
    })
    if (!active) return
    const promptMessageId = await sendQuestionnaireText({ session: reserved, settings, ...prompt })
    await releaseDelivery(reserved, { promptMessageId })
  } catch (error) {
    await releaseDelivery(reserved)
    throw error
  }
}

const readConversation = (scope) => TelegramConversations.findOne({
  tenantId: scope.tenantId, businessConnectionId: scope.businessConnectionId, telegramChatId: scope.telegramChatId,
}).lean()

const openSession = async ({ scope, conversation, messageId, config }) => {
  try {
    return await TelegramQuestionnaires.findOneAndUpdate(scope, { $setOnInsert: {
      ...scope, conversationId: conversation._id, callbackToken: randomToken(),
      eventId: new mongoose.Types.ObjectId(), step: 'offer', lastInputMessageId: messageId,
      ...snapshotTelegramQuestionnaire(config),
    } }, { upsert: true, returnDocument: 'after' }).lean()
  } catch (error) {
    if (error.code !== 11000) throw error
    return TelegramQuestionnaires.findOne(scope).lean()
  }
}

const monthRange = (timeZone, now) => {
  const day = dayjs(now).tz(timeZone)
  return { $gte: day.startOf('month').toDate(), $lt: day.add(1, 'month').startOf('month').toDate() }
}

const resolveTimeZone = (value) => {
  try { return new Intl.DateTimeFormat('ru', { timeZone: value || supportedTimeZone }).resolvedOptions().timeZone }
  catch { return supportedTimeZone }
}

const insertDraft = async (session, conversation) => {
  const { tenantId, eventId, submittedAt, answers } = session
  const eventScope = { _id: eventId, tenantId }
  const existing = await Events.findOne(eventScope).lean()
  if (existing) return existing
  const [settings, access, client] = await Promise.all([
    SiteSettings.findOne({ tenantId }).select('timeZone').lean(),
    getUserTariffAccess(tenantId),
    conversation.clientId ? Clients.exists({ _id: conversation.clientId, tenantId }) : null,
  ])
  const timeZone = resolveTimeZone(settings?.timeZone)
  if (!hasTelegramQuestionnaireAccess(access)) return null
  if (Number.isFinite(access.eventsPerMonth) && access.eventsPerMonth > 0) {
    const count = await Events.countDocuments({ tenantId, createdAt: monthRange(timeZone, new Date()) })
    if (count >= access.eventsPerMonth) return null
  }
  const description = [
    `Услуга: ${answers.service}`,
    answers.date ? 'Время заказа не указано.' : 'Дата заказа пока неизвестна.',
    answers.details,
  ].filter(Boolean).join('\n\n')
  const eventDate = answers.date ? dayjs.tz(`${answers.date}T12:00`, timeZone).toDate() : null
  const draft = {
    ...eventScope, status: 'draft', requestCreatedAt: submittedAt,
    createdAt: submittedAt, updatedAt: submittedAt,
    clientId: client?._id ?? null, description, eventType: answers.service, eventDate,
    address: { town: answers.city }, calendarImportChecked: true, showOnSite: false,
    additionalEvents: [buildPublicLeadInitialContactEvent(submittedAt)],
    clientData: {
      source: 'telegram', sourceLabel: 'Telegram',
      lead: { source: 'telegram', conversationId: String(conversation._id) },
    },
  }
  try {
    return await Events.findOneAndUpdate(eventScope, { $setOnInsert: draft }, {
      upsert: true, returnDocument: 'after', runValidators: true, timestamps: false,
    }).lean()
  } catch (error) {
    if (error.code !== 11000) throw error
    return Events.findOne(eventScope).lean()
  }
}

const notifyCreatedDraft = ({ event, tenantId }) => sendMultiChannelPushToTenant({
  tenantId, source: 'telegram_questionnaire', payload: {
    title: 'Новая заявка из Telegram', body: 'Откройте карточку, чтобы посмотреть ответы клиента.',
    icon: '/icons/vedelo-v1/android/android-launchericon-192-192.png',
    badge: '/icons/vedelo-v1/notification-badge.svg', tag: `telegram-questionnaire-${event._id}`,
    data: { url: `/cabinet/eventsUpcoming?openEvent=${event._id}`, eventId: String(event._id), type: 'telegram_questionnaire' },
  },
})

const finishQuestionnaire = async ({ session, settings, conversation }) => {
  const reserved = await claimDelivery(session)
  if (!reserved) return
  let event
  let finished
  try {
    event = await insertDraft(reserved, conversation)
    if (event) await TelegramConversations.updateOne({
      tenantId: reserved.tenantId, _id: reserved.conversationId,
      businessConnectionId: reserved.businessConnectionId, telegramChatId: reserved.telegramChatId,
    }, { $set: { eventId: event._id } })
    finished = await TelegramQuestionnaires.findOneAndUpdate(
      { ...currentState(reserved), deliveryToken: reserved.deliveryToken },
      { $set: { ...clearDelivery, step: event ? 'completed' : 'limit' }, $inc: { revision: 1 } },
      { returnDocument: 'after' }
    ).lean()
  } catch (error) {
    await releaseDelivery(reserved)
    throw error
  }
  if (!finished) return
  if (event) await Promise.allSettled([
    recordActivityHistory({ tenantId: reserved.tenantId, entityType: 'event', entityId: event._id, operation: 'create', after: event, source: 'telegram' }),
    notifyCreatedDraft({ event, tenantId: reserved.tenantId }),
  ])
  await sendPrompt({ session: finished, settings })
}

const handlePending = ({ session, settings, conversation }) => session.step === 'submitting'
  ? finishQuestionnaire({ session, settings, conversation })
  : sendPrompt({ session, settings })

export async function handleTelegramQuestionnaireMessage({ tenantId, settings, message, result }) {
  if (!canAutomate(settings) || !tenantId || result?.direction !== 'incoming') return ignored
  const chatId = String(message?.chat?.id || '')
  const messageId = readMessageId(message?.message_id)
  const connectionId = settings.businessConnectionId
  const conversation = result.conversation
  if (!chatId || !messageId || message.chat.type !== 'private' || String(message.from?.id || '') !== chatId ||
    String(message.business_connection_id || '') !== connectionId ||
    !matchingConversation(conversation, tenantId, connectionId, chatId) ||
    !isTelegramReplyWindowOpen(conversation.lastIncomingAt)) return ignored

  const scope = sessionScope(tenantId, connectionId, chatId)
  let session = await TelegramQuestionnaires.findOne(scope).lean()
  if (!session && result.isFirstIncomingMessage) {
    session = await openSession({ scope, conversation, messageId, config: settings.questionnaire })
  }
  if (!session || String(session.conversationId) !== String(conversation._id)) return ignored
  if (!session.promptMessageId) {
    await handlePending({ session, settings, conversation })
    return questionnaireActiveSteps.includes(session.step) && session.step !== 'offer' ? consumed : seen
  }
  if (messageId <= Math.max(session.lastInputMessageId, session.promptMessageId)) return seen
  const next = getTelegramQuestionnaireTextStep(session, message.text)
  if (!next) return ignored
  if (next.error) {
    if (result.isNewMessage) await sendQuestionnaireText({ session, settings, text: next.error })
    return consumed
  }
  const updated = await applyStep(session, next, messageId)
  if (updated) await sendPrompt({ session: updated, settings })
  return consumed
}

export async function handleTelegramQuestionnaireCallback({ tenantId, settings, callbackQuery }) {
  const data = callbackQuery?.data
  if (typeof data !== 'string' || !data.startsWith(TELEGRAM_QUESTIONNAIRE_PREFIX)) return ignored
  const answer = (text) => settings.botToken && callbackQuery.id
    ? answerTelegramCallbackQuery({ botToken: settings.botToken, callbackQueryId: callbackQuery.id, text }).catch(() => {})
    : undefined
  const callback = readTelegramQuestionnaireCallback(data)
  const message = callbackQuery.message
  const chatId = String(message?.chat?.id || '')
  const messageId = readMessageId(message?.message_id)
  const connectionId = settings.businessConnectionId
  if (!callback || !tenantId || !canAutomate(settings) || !chatId || !messageId || message.chat.type !== 'private' ||
    String(callbackQuery.from?.id || '') !== chatId || !matchingConnection(connectionId, message.business_connection_id)) {
    await answer('Эта кнопка больше недоступна.')
    return seen
  }
  const scope = sessionScope(tenantId, connectionId, chatId)
  const [session, conversation] = await Promise.all([
    TelegramQuestionnaires.findOne(scope).lean(), readConversation(scope),
  ])
  if (!session || !conversation || session.callbackToken !== callback.token ||
    String(session.conversationId) !== String(conversation._id)) {
    await answer('Эта кнопка больше недоступна.')
    return seen
  }
  if (!isTelegramReplyWindowOpen(conversation.lastIncomingAt)) {
    await answer('Напишите новое сообщение и снова нажмите кнопку.')
    return seen
  }
  const submittingRetry = callback.action === 'submit' && messageId === session.submittedFromMessageId
  if (submittingRetry && session.step === 'submitting') {
    await answer()
    await finishQuestionnaire({ session, settings, conversation })
    return seen
  }
  if (session.revision !== callback.revision || session.promptMessageId !== messageId) {
    await answer(submittingRetry && session.step === 'completed' ? 'Заявка уже отправлена.' : 'Этот шаг уже завершён.')
    if (!session.promptMessageId && (submittingRetry || session.revision === callback.revision + 1)) {
      await handlePending({ session, settings, conversation })
    }
    return seen
  }
  const next = getTelegramQuestionnaireCallbackStep(session, callback.action)
  if (!next) {
    await answer('Эта кнопка больше недоступна.')
    return seen
  }
  const updated = await applyStep(session, next)
  await answer(updated ? undefined : 'Этот шаг уже завершён.')
  if (updated) await handlePending({ session: updated, settings, conversation })
  return seen
}

export function pauseTelegramQuestionnaire({ tenantId, businessConnectionId, chatId, messageId }) {
  if (!tenantId || !businessConnectionId || !chatId) return null
  return TelegramQuestionnaires.updateOne({
    ...sessionScope(tenantId, businessConnectionId, String(chatId)), step: { $in: questionnaireActiveSteps },
    ...(messageId ? { lastInputMessageId: { $lt: messageId }, promptMessageId: { $lt: messageId } } : {}),
  }, { $set: { ...clearDelivery, step: 'paused' }, $inc: { revision: 1 } })
}
