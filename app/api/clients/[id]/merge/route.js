import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import AvitoConversations from '@models/AvitoConversations'
import AvitoMessages from '@models/AvitoMessages'
import Calls from '@models/Calls'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Transactions from '@models/Transactions'
import VkConversations from '@models/VkConversations'
import VkMessages from '@models/VkMessages'
import TelegramConversations from '@models/TelegramConversations'
import TelegramMessages from '@models/TelegramMessages'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { recordSyncTombstone } from '@server/mobile/sync'
import { recommendClientMergeTargetId } from '@helpers/clientMergeDirection'
import { recordActivityHistory } from '@server/activityHistory'

const isObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)))

const jsonError = (message, status = 400, code = 'client_merge_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'clients', message } },
    { status }
  )

const getDuplicateId = (req, body) => {
  if (body?.duplicateClientId) return String(body.duplicateClientId).trim()
  const { searchParams } = new URL(req.url)
  return String(searchParams.get('duplicateClientId') || '').trim()
}

const getMergePreview = async ({ tenantId, duplicateClientId }) => {
  const [
    events,
    eventsOtherContacts,
    eventsColleague,
    transactions,
    avitoConversations,
    avitoMessages,
    vkConversations,
    vkMessages,
    telegramConversations,
    telegramMessages,
    calls,
  ] = await Promise.all([
    Events.countDocuments({ tenantId, clientId: duplicateClientId }),
    Events.countDocuments({
      tenantId,
      'otherContacts.clientId': duplicateClientId,
    }),
    Events.countDocuments({ tenantId, colleagueId: duplicateClientId }),
    Transactions.countDocuments({ tenantId, clientId: duplicateClientId }),
    AvitoConversations.countDocuments({ tenantId, clientId: duplicateClientId }),
    AvitoMessages.countDocuments({ tenantId, clientId: duplicateClientId }),
    VkConversations.countDocuments({ tenantId, clientId: duplicateClientId }),
    VkMessages.countDocuments({ tenantId, clientId: duplicateClientId }),
    TelegramConversations.countDocuments({
      tenantId,
      clientId: duplicateClientId,
    }),
    TelegramMessages.countDocuments({ tenantId, clientId: duplicateClientId }),
    Calls.countDocuments({ tenantId, linkedClientId: duplicateClientId }),
  ])

  return {
    events,
    eventsOtherContacts,
    eventsColleague,
    transactions,
    avitoConversations,
    avitoMessages,
    vkConversations,
    vkMessages,
    telegramConversations,
    telegramMessages,
    calls,
    total:
      events +
      eventsOtherContacts +
      eventsColleague +
      transactions +
      avitoConversations +
      avitoMessages +
      vkConversations +
      vkMessages +
      telegramConversations +
      telegramMessages +
      calls,
  }
}

const hasValue = (value) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

const mergeMissingClientFields = (target, duplicate) => {
  const fields = [
    'firstName',
    'secondName',
    'thirdName',
    'email',
    'images',
    'gender',
    'phone',
    'whatsapp',
    'viber',
    'telegram',
    'telegramUserId',
    'instagram',
    'vk',
    'max',
    'preferredContactChannel',
    'preferredContactChannelOther',
    'clientType',
    'town',
    'legalName',
    'inn',
    'kpp',
    'ogrn',
    'bankName',
    'bik',
    'checkingAccount',
    'correspondentAccount',
    'legalAddress',
  ]

  const update = {}
  fields.forEach((field) => {
    if (!hasValue(target?.[field]) && hasValue(duplicate?.[field])) {
      update[field] = duplicate[field]
    }
  })

  const targetComment = String(target?.comment || '').trim()
  const duplicateComment = String(duplicate?.comment || '').trim()
  if (duplicateComment && !targetComment.includes(duplicateComment)) {
    update.comment = [targetComment, duplicateComment].filter(Boolean).join('\n\n')
  }

  const significantDates = []
  const significantDateKeys = new Set()
  for (const item of [...(target?.significantDates || []), ...(duplicate?.significantDates || [])]) {
    const date = item?.date ? new Date(item.date).toISOString() : ''
    const title = String(item?.title || '').trim()
    const comment = String(item?.comment || '').trim()
    const key = `${title.toLowerCase()}|${date}|${comment.toLowerCase()}`
    if ((!title && !date && !comment) || significantDateKeys.has(key)) continue
    significantDateKeys.add(key)
    significantDates.push({ title, date: item?.date || null, comment })
  }
  if (significantDates.length !== (target?.significantDates || []).length) {
    update.significantDates = significantDates
  }

  return update
}

const loadClients = async ({ tenantId, targetClientId, duplicateClientId }) => {
  const [targetClient, duplicateClient] = await Promise.all([
    Clients.findOne({ _id: targetClientId, tenantId }),
    Clients.findOne({ _id: duplicateClientId, tenantId }),
  ])

  if (!targetClient) return { error: jsonError('Основной клиент не найден', 404) }
  if (!duplicateClient) return { error: jsonError('Клиент-дубль не найден', 404) }
  return { targetClient, duplicateClient }
}

export const GET = async (req, { params }) => {
  const { tenantId } = await getRequestContext(req)
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const targetClientId = String(routeParams?.id || '').trim()
  const duplicateClientId = getDuplicateId(req)
  if (!isObjectId(targetClientId) || !isObjectId(duplicateClientId)) {
    return jsonError('Некорректный ID клиента', 400, 'bad_client_id')
  }
  if (targetClientId === duplicateClientId) {
    return jsonError('Нельзя объединить клиента с самим собой', 400, 'same_client')
  }

  await dbConnect()
  const { targetClient, duplicateClient, error } = await loadClients({
    tenantId,
    targetClientId,
    duplicateClientId,
  })
  if (error) return error

  const [targetPreview, duplicatePreview] = await Promise.all([
    getMergePreview({ tenantId, duplicateClientId: targetClientId }),
    getMergePreview({ tenantId, duplicateClientId }),
  ])
  const recommendedTargetClientId = recommendClientMergeTargetId({
    currentClientId: targetClientId,
    selectedClientId: duplicateClientId,
    currentPreview: targetPreview,
    selectedPreview: duplicatePreview,
  })

  return NextResponse.json(
    {
      success: true,
      data: {
        targetClient,
        duplicateClient,
        preview: duplicatePreview,
        targetPreview,
        duplicatePreview,
        recommendedTargetClientId,
      },
    },
    { status: 200 }
  )
}

export const POST = async (req, { params }) => {
  const context = await getRequestContext(req)
  const { tenantId } = context
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const targetClientId = String(routeParams?.id || '').trim()
  const body = await req.json().catch(() => ({}))
  const duplicateClientId = getDuplicateId(req, body)
  if (!isObjectId(targetClientId) || !isObjectId(duplicateClientId)) {
    return jsonError('Некорректный ID клиента', 400, 'bad_client_id')
  }
  if (targetClientId === duplicateClientId) {
    return jsonError('Нельзя объединить клиента с самим собой', 400, 'same_client')
  }

  await dbConnect()
  const { targetClient, duplicateClient, error } = await loadClients({
    tenantId,
    targetClientId,
    duplicateClientId,
  })
  if (error) return error

  const targetObjectId = new mongoose.Types.ObjectId(targetClientId)
  const duplicateObjectId = new mongoose.Types.ObjectId(duplicateClientId)
  const clientUpdate = mergeMissingClientFields(targetClient, duplicateClient)

  const [
    eventsResult,
    eventsOtherContactsResult,
    eventsColleagueResult,
    transactionsResult,
    avitoConversationsResult,
    avitoMessagesResult,
    vkConversationsResult,
    vkMessagesResult,
    telegramConversationsResult,
    telegramMessagesResult,
    callsResult,
    updatedClient,
  ] = await Promise.all([
    Events.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId }, $inc: { syncVersion: 1 } }
    ),
    Events.updateMany(
      { tenantId, 'otherContacts.clientId': duplicateObjectId },
      {
        $set: { 'otherContacts.$[contact].clientId': targetObjectId },
        $inc: { syncVersion: 1 },
      },
      { arrayFilters: [{ 'contact.clientId': duplicateObjectId }] }
    ),
    Events.updateMany(
      { tenantId, colleagueId: duplicateObjectId },
      { $set: { colleagueId: targetObjectId }, $inc: { syncVersion: 1 } }
    ),
    Transactions.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId }, $inc: { syncVersion: 1 } }
    ),
    AvitoConversations.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    AvitoMessages.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    VkConversations.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    VkMessages.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    TelegramConversations.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    TelegramMessages.updateMany(
      { tenantId, clientId: duplicateObjectId },
      { $set: { clientId: targetObjectId } }
    ),
    Calls.updateMany(
      { tenantId, linkedClientId: duplicateObjectId },
      { $set: { linkedClientId: targetObjectId } }
    ),
    Clients.findOneAndUpdate(
      { _id: targetObjectId, tenantId },
      {
        ...(Object.keys(clientUpdate).length ? { $set: clientUpdate } : {}),
        $inc: { syncVersion: 1 },
      },
      { returnDocument: 'after', runValidators: true }
    ),
  ])

  const deleted = await Clients.findOneAndDelete({
    _id: duplicateObjectId,
    tenantId,
  }).lean()
  if (!deleted) {
    return jsonError('Клиент-дубль уже удален', 404, 'duplicate_not_found')
  }
  try {
    await recordSyncTombstone({
      tenantId,
      entityType: 'clients',
      entityId: duplicateClientId,
      version: deleted.syncVersion || 1,
    })
  } catch (error) {
    console.error('Не удалось записать tombstone объединённого клиента', error)
  }

  await recordActivityHistory({
    req,
    context,
    entityType: 'client',
    entityId: updatedClient._id,
    operation: 'merge',
    before: targetClient,
    after: updatedClient.toJSON?.() ?? updatedClient,
    summary: `Объединены клиенты: ${[duplicateClient.firstName, duplicateClient.secondName].filter(Boolean).join(' ') || 'дубликат'} → ${[updatedClient.firstName, updatedClient.secondName].filter(Boolean).join(' ') || 'клиент'}`,
  })

  return NextResponse.json(
    {
      success: true,
      data: {
        client: updatedClient,
        deletedClientId: duplicateClientId,
        moved: {
          events: eventsResult.modifiedCount || 0,
          eventsOtherContacts: eventsOtherContactsResult.modifiedCount || 0,
          eventsColleague: eventsColleagueResult.modifiedCount || 0,
          transactions: transactionsResult.modifiedCount || 0,
          avitoConversations: avitoConversationsResult.modifiedCount || 0,
          avitoMessages: avitoMessagesResult.modifiedCount || 0,
          vkConversations: vkConversationsResult.modifiedCount || 0,
          vkMessages: vkMessagesResult.modifiedCount || 0,
          telegramConversations:
            telegramConversationsResult.modifiedCount || 0,
          telegramMessages: telegramMessagesResult.modifiedCount || 0,
          calls: callsResult.modifiedCount || 0,
        },
      },
    },
    { status: 200 }
  )
}
