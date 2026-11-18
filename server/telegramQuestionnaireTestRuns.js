import { randomUUID } from 'node:crypto'
import Clients from '@models/Clients'
import Services from '@models/Services'
import TelegramConversations from '@models/TelegramConversations'
import TelegramMessages from '@models/TelegramMessages'
import TelegramQuestionnaires from '@models/TelegramQuestionnaires'
import TelegramQuestionnaireTestRuns from '@models/TelegramQuestionnaireTestRuns'
import { questionnaireError } from '@server/telegramQuestionnaireSettings'

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const chatScope = (tenantId, businessConnectionId) => ({ tenantId, businessConnectionId, status: 'open' })

export const validateTelegramQuestionnaireReferences = async ({ tenantId, businessConnectionId, questionnaire }) => {
  const chatIds = questionnaire.testChatIds ?? []
  const serviceIds = [...new Set((questionnaire.blocks ?? []).flatMap(block =>
    block.type === 'services' ? block.options.map(option => option.serviceId) : []))]
  const [chats, services] = await Promise.all([
    chatIds.length ? TelegramConversations.countDocuments({ ...chatScope(tenantId, businessConnectionId), _id: { $in: chatIds } }) : 0,
    serviceIds.length ? Services.countDocuments({ tenantId, _id: { $in: serviceIds } }) : 0,
  ])
  if (chats !== chatIds.length) throw questionnaireError('Изменился список доступных тестовых чатов', 409)
  if (services !== serviceIds.length) throw questionnaireError('Некоторые услуги больше не доступны в каталоге', 409)
}

const phoneCandidates = (query) => {
  if (!/^[+()\d\s-]+$/.test(query)) return []
  const digits = query.replace(/\D/g, '')
  if (digits.length < 5 || digits.length > 15) return []
  if (/^8\d{10}$/.test(digits)) return [digits, `7${digits.slice(1)}`]
  return /^7\d{10}$/.test(digits) ? [digits, `8${digits.slice(1)}`] : [digits]
}

const findChats = async ({ tenantId, businessConnectionId, query, selected }) => {
  if (!businessConnectionId) return []
  const scope = chatScope(tenantId, businessConnectionId)
  const regex = { $regex: escapeRegExp(query.replace(/^@/, '')), $options: 'i' }
  const filters = [{ clientName: regex }, { telegramUsername: regex }]
  const phones = phoneCandidates(query)
  if (query) {
    const clientFilter = phones.length
      ? { $or: [{ phone: { $in: phones.map(Number) } }, { telegramPhone: { $in: phones.flatMap(phone => [phone, `+${phone}`]) } }] }
      : { $and: query.split(/\s+/).slice(0, 4).map(part => {
          const name = { $regex: escapeRegExp(part), $options: 'i' }
          return { $or: [{ firstName: name }, { secondName: name }] }
        }) }
    const clients = await Clients.find({ tenantId, ...clientFilter }).select('_id').limit(100).lean()
    filters.push({ clientId: { $in: clients.map(client => client._id) } })
  }
  const [matches, pinned] = await Promise.all([
    TelegramConversations.find({ ...scope, ...(query ? { $or: filters } : {}) })
      .select('_id clientId clientName telegramUsername').sort({ lastMessageAt: -1 }).limit(30).lean(),
    selected.length
      ? TelegramConversations.find({ ...scope, _id: { $in: selected } }).select('_id clientId clientName telegramUsername').lean()
      : [],
  ])
  const unique = [...new Map([...pinned, ...matches].map(chat => [String(chat._id), chat])).values()]
  const clientIds = unique.flatMap(chat => chat.clientId ? [chat.clientId] : [])
  const clients = clientIds.length
    ? await Clients.find({ tenantId, _id: { $in: clientIds } }).select('_id phone telegramPhone firstName secondName').lean()
    : []
  const byId = new Map(clients.map(client => [String(client._id), client]))
  return unique.map(chat => {
    const client = byId.get(String(chat.clientId))
    return {
      id: String(chat._id), name: [client?.firstName, client?.secondName].filter(Boolean).join(' ') || chat.clientName || 'Telegram-диалог',
      username: chat.telegramUsername || '', phone: String(client?.telegramPhone || client?.phone || ''),
    }
  })
}

const resolveStatus = (session) => {
  if (!session) return 'waiting'
  if (session.step === 'limit') return 'limited'
  if (session.step === 'completed') return 'completed'
  if (['paused', 'cancelled', 'handedOff'].includes(session.step)) return session.step
  return 'inProgress'
}

const publicRun = (run, session) => ({
  chatId: String(run.chatId), runId: run.runId, createDraft: run.createDraft,
  status: resolveStatus(session), result: session?.testResult ?? null,
})

export const listTelegramQuestionnaireTests = async ({ tenantId, businessConnectionId, questionnaire, query }) => {
  const selected = questionnaire.testChatIds ?? []
  const [chats, runs, services] = await Promise.all([
    findChats({ tenantId, businessConnectionId, query, selected }),
    businessConnectionId && selected.length ? TelegramQuestionnaireTestRuns.find({
      tenantId, businessConnectionId, chatId: { $in: selected },
    }).lean() : [],
    Services.find({ tenantId }).select('_id title').sort({ title: 1 }).lean(),
  ])
  const sessions = runs.length ? await TelegramQuestionnaires.find({
    tenantId, businessConnectionId, testRunId: { $in: runs.map(run => run.runId) },
  }).select('testRunId step testResult').lean() : []
  const byRunId = new Map(sessions.map(session => [session.testRunId, session]))
  return { chats, runs: runs.map(run => publicRun(run, byRunId.get(run.runId))),
    services: services.map(service => ({ id: String(service._id), name: service.title })) }
}

export const armTelegramQuestionnaireTest = async ({ tenantId, businessConnectionId, questionnaire, chatId, createDraft }) => {
  if (questionnaire.mode !== 'test' || !questionnaire.testChatIds.includes(chatId)) {
    throw questionnaireError('Сохраните тестовый режим с выбранным чатом', 409)
  }
  const chat = await TelegramConversations.findOne({ ...chatScope(tenantId, businessConnectionId), _id: chatId })
    .select('_id telegramChatId').lean()
  if (!chat) throw questionnaireError('Диалог Telegram не найден', 404)
  const armedAt = new Date()
  // Telegram передаёт время сообщения с точностью до секунды.
  const recent = await TelegramMessages.find({ tenantId, businessConnectionId, conversationId: chat._id,
    direction: 'incoming', sentAt: { $gte: new Date(Math.floor(armedAt.getTime() / 1000) * 1000) },
  }).select('telegramMessageId').lean()
  const armedAfterMessageId = recent.reduce((latest, row) => {
    const id = Number(row.telegramMessageId)
    return Number.isSafeInteger(id) ? Math.max(latest, id) : latest
  }, 0)
  await TelegramQuestionnaireTestRuns.init()
  const run = await TelegramQuestionnaireTestRuns.findOneAndUpdate({ tenantId, chatId }, { $set: {
    businessConnectionId, telegramChatId: chat.telegramChatId, runId: randomUUID(), createDraft, armedAt, armedAfterMessageId,
  } }, { upsert: true, returnDocument: 'after' }).lean()
  return publicRun(run)
}

export const readTelegramQuestionnaireTestRun = async ({ tenantId, businessConnectionId, telegramChatId, questionnaire }) => {
  if (questionnaire.mode !== 'test' || !businessConnectionId || !telegramChatId || !questionnaire.testChatIds?.length) return null
  const run = await TelegramQuestionnaireTestRuns.findOne({
    tenantId, businessConnectionId, telegramChatId: String(telegramChatId), chatId: { $in: questionnaire.testChatIds },
  }).select('runId createDraft armedAt armedAfterMessageId').lean()
  return run ? { id: run.runId, createDraft: run.createDraft, armedAt: run.armedAt, armedAfterMessageId: run.armedAfterMessageId } : null
}
