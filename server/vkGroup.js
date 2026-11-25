import crypto from 'crypto'
import SiteSettings from '@models/SiteSettings'
import { siteSettingsCustomPaths } from '@helpers/siteSettingsCustom.mjs'
import Clients from '@models/Clients'
import Events from '@models/Events'
import VkConversations from '@models/VkConversations'
import VkMessages from '@models/VkMessages'
import {
  createPublicLeadDraftEvent,
  normalizeText,
  readCustomValue,
} from '@server/publicLeadService'
import { notifyIncomingClientMessage } from '@server/messengerPush'

const VK_API_BASE_URL =
  process.env.VK_API_BASE_URL || 'https://api.vk.com/method'
const VK_API_VERSION = '5.199'

const toObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}

const getFirstString = (...values) => {
  const value = values.find(
    (item) => item !== undefined && item !== null && String(item).trim()
  )
  return value === undefined || value === null ? '' : String(value).trim()
}

const createVkWebhookToken = () =>
  `vk_${crypto.randomUUID().replace(/-/g, '')}`

const createVkWebhookSecret = () =>
  `vksec_${crypto.randomUUID().replace(/-/g, '')}`

const normalizeVkSettings = (custom) => ({
  enabled: readCustomValue(custom, 'vkGroupEnabled') === true,
  groupId: normalizeText(readCustomValue(custom, 'vkGroupId'), 120),
  accessToken: normalizeText(readCustomValue(custom, 'vkGroupAccessToken'), 512),
  confirmationCode: normalizeText(
    readCustomValue(custom, 'vkGroupConfirmationCode'),
    256
  ),
  webhookSecret: normalizeText(readCustomValue(custom, 'vkGroupWebhookSecret'), 160),
  webhookToken: normalizeText(readCustomValue(custom, 'vkGroupWebhookToken'), 160),
  webhookUrl: normalizeText(readCustomValue(custom, 'vkGroupWebhookUrl'), 1000),
  status: normalizeText(readCustomValue(custom, 'vkGroupStatus'), 80),
  lastError: normalizeText(readCustomValue(custom, 'vkGroupLastError'), 1000),
  connectedAt: normalizeText(readCustomValue(custom, 'vkGroupConnectedAt'), 80),
  lastCheckedAt: normalizeText(readCustomValue(custom, 'vkGroupLastCheckedAt'), 80),
  lastWebhookAt: normalizeText(readCustomValue(custom, 'vkGroupLastWebhookAt'), 80),
  lastPeerId: normalizeText(readCustomValue(custom, 'vkGroupLastPeerId'), 160),
})

const buildPublicBaseUrl = (req) => {
  const envDomain = normalizeText(process.env.DOMAIN, 300)
  if (envDomain) {
    return envDomain.startsWith('http') ? envDomain : `https://${envDomain}`
  }

  const origin = normalizeText(req?.headers?.get?.('origin'), 300)
  if (origin) return origin

  const host = normalizeText(req?.headers?.get?.('host'), 300)
  if (!host) return ''
  const proto = normalizeText(req?.headers?.get?.('x-forwarded-proto'), 20)
  return `${proto || 'https'}://${host}`
}

const buildVkWebhookUrl = ({ req, token }) => {
  const baseUrl = buildPublicBaseUrl(req).replace(/\/+$/, '')
  if (!baseUrl || !token) return ''
  return `${baseUrl}/api/integrations/vk/webhook/${token}`
}

const callVkApi = async (method, params = {}) => {
  const body = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      body.set(key, String(value))
    }
  })
  body.set('v', params.v || VK_API_VERSION)

  const response = await fetch(`${VK_API_BASE_URL}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok || payload?.error) {
    const error = payload?.error
    const message =
      error?.error_msg ||
      payload?.message ||
      `VK API ${method} failed: ${response.status}`
    throw new Error(message)
  }

  return payload.response
}

const checkVkGroupAccess = async ({ accessToken, groupId }) => {
  const params = { access_token: accessToken }
  if (groupId) {
    params.group_id = groupId
    params.group_ids = groupId
  }
  return callVkApi('groups.getById', params)
}

const getVkUserProfile = async ({ accessToken, userId }) => {
  if (!accessToken || !userId) return null

  try {
    const response = await callVkApi('users.get', {
      access_token: accessToken,
      user_ids: userId,
      fields: 'screen_name',
    })
    const user = Array.isArray(response) ? response[0] : null
    if (!user) return null

    const firstName = normalizeText(user.first_name, 120)
    const lastName = normalizeText(user.last_name, 120)
    const screenName = normalizeText(user.screen_name, 120)
    return {
      id: normalizeText(user.id, 120),
      firstName,
      lastName,
      screenName,
      name: [firstName, lastName].filter(Boolean).join(' '),
    }
  } catch (error) {
    return null
  }
}

const sendVkMessage = async ({ accessToken, peerId, text }) => {
  if (!accessToken || !peerId || !text) {
    return { ok: false, error: 'missing_send_params' }
  }

  try {
    const response = await callVkApi('messages.send', {
      access_token: accessToken,
      peer_id: peerId,
      random_id: Date.now(),
      message: text,
    })
    return { ok: true, payload: response }
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      payload: null,
    }
  }
}

const VK_ATTACHMENT_LABELS = {
  audio: 'Аудио',
  audio_message: 'Голосовое сообщение',
  doc: 'Документ',
  gift: 'Подарок',
  graffiti: 'Граффити',
  link: 'Ссылка',
  market: 'Товар',
  photo: 'Фото',
  poll: 'Опрос',
  sticker: 'Стикер',
  story: 'История',
  video: 'Видео',
  video_message: 'Видео-кружок',
  wall: 'Запись на стене',
}

const getVkAttachmentText = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : []
  if (attachments.length === 0) return ''

  const labels = attachments
    .map((attachment) => {
      const type = normalizeText(attachment?.type, 80)
      if (!type) return ''
      return VK_ATTACHMENT_LABELS[type] || `Вложение: ${type}`
    })
    .filter(Boolean)

  if (labels.length === 0) return 'Вложение VK'
  return [...new Set(labels)].join(', ')
}

const normalizeVkAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : []

  return attachments
    .map((attachment) => {
      const type = normalizeText(attachment?.type, 80)
      if (!type) return null
      const payload = toObject(attachment?.[type])
      const audioMessage = type === 'audio_message' ? payload : {}
      const photo = type === 'photo' ? payload : {}
      const video = ['video', 'video_message', 'clip'].includes(type)
        ? payload
        : {}
      const doc = type === 'doc' ? payload : {}
      const audioUrl = normalizeText(
        getFirstString(
          audioMessage?.link_mp3,
          audioMessage?.link_ogg,
          audioMessage?.url
        ),
        2000
      )
      const photoSizes = Array.isArray(photo?.sizes) ? photo.sizes : []
      const photoUrl = normalizeText(
        photoSizes
          .slice()
          .sort((a, b) => Number(b?.width || 0) - Number(a?.width || 0))
          .find((size) => size?.url)?.url,
        2000
      )
      const videoUrl = normalizeText(
        getFirstString(
          video?.link,
          video?.player,
          video?.url,
          video?.files?.mp4_1080,
          video?.files?.mp4_720,
          video?.files?.mp4_480,
          video?.files?.mp4_360,
          video?.files?.mp4_240
        ),
        2000
      )
      const previewUrl = normalizeText(
        getFirstString(
          video?.image?.[0]?.url,
          video?.first_frame?.[0]?.url,
          video?.photo_800,
          video?.photo_640,
          video?.photo_320
        ),
        2000
      )
      const fileUrl = normalizeText(doc?.url, 2000)
      const fileName = normalizeText(doc?.title, 300)

      return {
        type,
        label: VK_ATTACHMENT_LABELS[type] || `Вложение: ${type}`,
        audioUrl,
        photoUrl,
        videoUrl,
        previewUrl,
        fileUrl,
        fileName,
        fileExt: normalizeText(doc?.ext, 40),
        fileSize: Number(doc?.size) > 0 ? Number(doc.size) : null,
        title: normalizeText(video?.title || photo?.text || fileName, 300),
        duration:
          Number(audioMessage?.duration || video?.duration) > 0
            ? Number(audioMessage.duration || video.duration)
            : null,
        raw: attachment,
      }
    })
    .filter(Boolean)
}

const normalizeVkWebhookPayload = (body = {}) => {
  const object = toObject(body?.object)
  const message = toObject(object?.message || body?.message)
  const text = normalizeText(getFirstString(message?.text, body?.text), 5000)
  const attachmentText = getVkAttachmentText(message)
  const attachments = normalizeVkAttachments(message)
  const peerId = normalizeText(
    getFirstString(message?.peer_id, message?.from_id, body?.peer_id),
    160
  )
  const userId = normalizeText(getFirstString(message?.from_id, body?.from_id), 160)
  const messageId = normalizeText(
    getFirstString(
      message?.id,
      message?.conversation_message_id,
      body?.message_id
    ),
    160
  )
  const groupId = normalizeText(getFirstString(body?.group_id, object?.group_id), 160)
  const date = Number(message?.date) > 0 ? new Date(Number(message.date) * 1000) : null

  return {
    source: 'vk_group',
    sourceLabel: 'VK',
    name: userId ? `Клиент VK ${userId}` : 'Клиент VK',
    phone: '',
    comment: text || attachmentText || 'Сообщение VK без текста',
    vkPeerId: peerId,
    vkMessageId: messageId,
    vkUserId: userId,
    vkGroupId: groupId,
    attachments,
    sentAt: date,
  }
}

const getVkContactValue = (vkUserId) => {
  const id = normalizeText(vkUserId, 120)
  if (!id) return ''
  return `id${id.replace(/^-/, '')}`
}

const normalizeStoredVkContact = (value) => {
  const text = normalizeText(value, 300)
  if (!text) return ''
  return text
    .replace(/^https?:\/\/(www\.)?(m\.)?vk\.(com|ru)\//i, '')
    .replace(/^@+/, '')
    .replace(/^\/+/, '')
    .split(/[/?#]/)[0]
    .trim()
}

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const buildVkContactMatchValues = ({ vkContact, screenName }) => {
  const values = [
    vkContact,
    `https://vk.com/${vkContact}`,
    `http://vk.com/${vkContact}`,
  ]

  const normalizedScreenName = normalizeStoredVkContact(screenName)
  if (normalizedScreenName) {
    values.push(
      normalizedScreenName,
      `@${normalizedScreenName}`,
      `https://vk.com/${normalizedScreenName}`,
      `http://vk.com/${normalizedScreenName}`,
      `https://m.vk.com/${normalizedScreenName}`,
      `http://m.vk.com/${normalizedScreenName}`
    )
  }

  return [...new Set(values.filter(Boolean))]
}

const upsertVkLeadClient = async ({ tenantId, normalized }) => {
  const vkContact = getVkContactValue(normalized.vkUserId)
  if (!vkContact) return null
  const firstName = normalizeText(normalized.firstName || normalized.name, 120)
  const secondName = normalizeText(normalized.lastName, 120)
  const vkContactValues = buildVkContactMatchValues({
    vkContact,
    screenName: normalized.vkScreenName,
  })

  let client = await Clients.findOne({ tenantId, vk: { $in: vkContactValues } })
  const normalizedScreenName = normalizeStoredVkContact(normalized.vkScreenName)
  if (!client && normalizedScreenName) {
    const screenNameRegex = new RegExp(
      `^(https?:\\/\\/(www\\.)?(m\\.)?vk\\.(com|ru)\\/|@)?${escapeRegExp(normalizedScreenName)}\\/?$`,
      'i'
    )
    client = await Clients.findOne({ tenantId, vk: screenNameRegex })
  }
  if (client) {
    let hasChanges = false
    if (client.vk !== vkContact) {
      client.vk = vkContact
      hasChanges = true
    }
    if (!client.firstName && firstName) {
      client.firstName = firstName
      hasChanges = true
    }
    if (!client.secondName && secondName) {
      client.secondName = secondName
      hasChanges = true
    }
    if (!client.preferredContactChannel) {
      client.preferredContactChannel = 'vk'
      hasChanges = true
    }
    if (hasChanges) await client.save()
    return client
  }

  const existingConversation = await VkConversations.findOne({
    tenantId,
    vkUserId: normalized.vkUserId,
    clientId: { $ne: null },
  })
    .sort({ lastMessageAt: -1 })
    .lean()
  if (existingConversation?.clientId) {
    client = await Clients.findOne({ _id: existingConversation.clientId, tenantId })
    if (client) {
      let hasChanges = false
      if (!client.vk) {
        client.vk = vkContact
        hasChanges = true
      }
      if (!client.firstName && firstName) {
        client.firstName = firstName
        hasChanges = true
      }
      if (!client.secondName && secondName) {
        client.secondName = secondName
        hasChanges = true
      }
      if (!client.preferredContactChannel) {
        client.preferredContactChannel = 'vk'
        hasChanges = true
      }
      if (hasChanges) await client.save()
      return client
    }
  }

  return Clients.create({
    tenantId,
    firstName,
    secondName,
    vk: vkContact,
    preferredContactChannel: 'vk',
    clientType: 'none',
  })
}

const findClientForVkConversation = async ({ tenantId, normalized }) => {
  const client = await upsertVkLeadClient({ tenantId, normalized })
  return client?._id ?? null
}

const upsertVkConversation = async ({
  tenantId,
  normalized,
  rawPayload,
  clientId,
  eventId,
  incrementUnread = true,
}) => {
  if (!normalized.vkPeerId) return null

  const now = normalized.sentAt || new Date()
  const existing = await VkConversations.findOne({
    tenantId,
    vkPeerId: normalized.vkPeerId,
  })

  const update = {
    tenantId,
    clientId: clientId ?? existing?.clientId ?? null,
    eventId: eventId ?? existing?.eventId ?? null,
    vkPeerId: normalized.vkPeerId,
    vkUserId: normalized.vkUserId || existing?.vkUserId || '',
    vkGroupId: normalized.vkGroupId || existing?.vkGroupId || '',
    clientName: normalized.name || existing?.clientName || '',
    lastMessageText: normalized.comment || existing?.lastMessageText || '',
    lastMessageAt: now,
    raw: rawPayload,
  }

  return VkConversations.findOneAndUpdate(
    { tenantId, vkPeerId: normalized.vkPeerId },
    existing
      ? {
          $set: update,
          ...(incrementUnread ? { $inc: { unreadCount: 1 } } : {}),
        }
      : {
          $set: update,
          $setOnInsert: {
            status: 'open',
            unreadCount: incrementUnread ? 1 : 0,
          },
        },
    { upsert: true, returnDocument: 'after' }
  )
}

const saveIncomingVkMessage = async ({
  tenantId,
  conversation,
  normalized,
  rawPayload,
  isNewMessage = true,
}) => {
  if (!conversation?._id || !normalized.vkPeerId) return null

  if (!isNewMessage && normalized.vkMessageId) {
    return VkMessages.findOne({
      tenantId,
      vkPeerId: normalized.vkPeerId,
      vkMessageId: normalized.vkMessageId,
    }).lean()
  }

  return VkMessages.create({
    tenantId,
    conversationId: conversation._id,
    clientId: conversation.clientId ?? null,
    eventId: conversation.eventId ?? null,
    vkPeerId: normalized.vkPeerId,
    vkMessageId: normalized.vkMessageId,
    vkUserId: normalized.vkUserId,
    direction: 'incoming',
    text: normalized.comment,
    attachments: normalized.attachments ?? [],
    sentAt: normalized.sentAt || new Date(),
    status: 'received',
    raw: rawPayload,
  })
}

const appendMessageToExistingEvent = async ({ event, normalized, rawPayload }) => {
  const clientData = toObject(event.clientData)
  const lead = toObject(clientData.lead)
  const messages = Array.isArray(lead.messages) ? lead.messages.slice(-49) : []
  const nextMessage = {
    id: normalized.vkMessageId,
    text: normalized.comment,
    attachments: normalized.attachments ?? [],
    receivedAt: new Date().toISOString(),
    raw: rawPayload,
  }

  const duplicateMessage =
    nextMessage.id && messages.some((item) => item?.id === nextMessage.id)
  const nextLead = {
    ...lead,
    ...normalized,
    raw: rawPayload,
    lastMessageAt: new Date().toISOString(),
    messages: duplicateMessage ? messages : [...messages, nextMessage],
  }

  event.clientData = {
    ...clientData,
    source: 'VK',
    sourceLabel: 'VK',
    createdViaApi: true,
    lead: nextLead,
  }

  if (!event.clientId && normalized.clientId) {
    event.clientId = normalized.clientId
  }

  if (
    normalized.comment &&
    !String(event.description || '').includes(normalized.comment)
  ) {
    event.description = `${event.description || ''}\n\nVK: ${normalized.comment}`.trim()
  }

  await event.save()
  return event
}

const notifyVkMessage = async ({ tenantId, event, conversation, normalized }) =>
  notifyIncomingClientMessage({
    tenantId,
    provider: 'vk',
    messageId: normalized.vkMessageId,
    messageText: normalized.comment,
    clientId: conversation?.clientId || event?.clientId,
    clientName: conversation?.clientName || normalized.name,
    conversationId: conversation?._id,
    unreadCount: conversation?.unreadCount || 0,
    associatedEvent: event,
  }).catch((error) => {
    console.error('Не удалось отправить push о сообщении VK', error)
    return null
  })

const createOrUpdateVkLead = async ({ tenantId, siteSettings, body }) => {
  const normalized = normalizeVkWebhookPayload(body)
  if (!normalized.vkPeerId && !normalized.comment) {
    return { ok: false, status: 400, error: 'empty_vk_message' }
  }
  const vkSettings = normalizeVkSettings(siteSettings?.custom)
  const profile = await getVkUserProfile({
    accessToken: vkSettings.accessToken,
    userId: normalized.vkUserId,
  })
  if (profile?.name) {
    normalized.name = profile.name
    normalized.firstName = profile.firstName
    normalized.lastName = profile.lastName
    normalized.vkScreenName = profile.screenName
  }

  const linkedClientId = await findClientForVkConversation({
    tenantId,
    normalized,
  })
  const isNewMessage = normalized.vkMessageId
    ? !(await VkMessages.exists({
        tenantId,
        vkPeerId: normalized.vkPeerId,
        vkMessageId: normalized.vkMessageId,
      }))
    : true

  const existingEvent = normalized.vkPeerId
    ? await Events.findOne({
        tenantId,
        'clientData.lead.source': 'vk_group',
        'clientData.lead.vkPeerId': normalized.vkPeerId,
      })
    : null

  if (existingEvent) {
    const normalizedForEvent = {
      ...normalized,
      clientId: existingEvent.clientId ?? linkedClientId,
    }
    const conversation = await upsertVkConversation({
      tenantId,
      normalized: normalizedForEvent,
      rawPayload: body,
      clientId: existingEvent.clientId ?? linkedClientId,
      eventId: existingEvent._id,
      incrementUnread: isNewMessage,
    })
    await saveIncomingVkMessage({
      tenantId,
      conversation,
      normalized: normalizedForEvent,
      rawPayload: body,
      isNewMessage,
    })
    const event = await appendMessageToExistingEvent({
      event: existingEvent,
      normalized: normalizedForEvent,
      rawPayload: body,
    })
    if (isNewMessage) {
      await notifyVkMessage({ tenantId, event, conversation, normalized })
    }
    return { ok: true, event, created: false, normalized }
  }

  const event = await createPublicLeadDraftEvent({
    tenantId,
    clientId: linkedClientId,
    normalizedData: {
      ...normalized,
      source: 'vk_group',
      sourceLabel: 'VK',
      raw: undefined,
    },
    rawPayload: body,
    historyUserId: 'vk-group-webhook',
    apiKeyData: {
      id: 'vk_group',
      name: 'VK',
    },
  })

  const conversation = await upsertVkConversation({
    tenantId,
    normalized,
    rawPayload: body,
    clientId: linkedClientId,
    eventId: event._id,
    incrementUnread: isNewMessage,
  })
  await saveIncomingVkMessage({
    tenantId,
    conversation,
    normalized,
    rawPayload: body,
    isNewMessage,
  })
  if (isNewMessage) {
    await notifyVkMessage({ tenantId, event, conversation, normalized })
  }

  return {
    ok: true,
    event,
    clientId: linkedClientId,
    conversation,
    created: true,
    normalized,
  }
}

const backfillVkLeadClients = async ({ tenantId }) => {
  const conversations = await VkConversations.find({
    tenantId,
    vkUserId: { $nin: ['', null] },
  })
    .sort({ updatedAt: -1 })
    .limit(500)

  let clientsUpdated = 0
  let eventsUpdated = 0
  let conversationsUpdated = 0

  for (const conversation of conversations) {
    const client = await upsertVkLeadClient({
      tenantId,
      normalized: {
        vkUserId: conversation.vkUserId,
        name: conversation.clientName || `Клиент VK ${conversation.vkUserId}`,
      },
    })
    if (!client?._id) continue
    clientsUpdated += 1

    if (!conversation.clientId) {
      conversation.clientId = client._id
      await conversation.save()
      conversationsUpdated += 1
    }

    if (conversation.eventId) {
      const event = await Events.findOne({
        _id: conversation.eventId,
        tenantId,
      })
      if (event && !event.clientId) {
        event.clientId = client._id
        await event.save()
        eventsUpdated += 1
      }
    }
  }

  const events = await Events.find({
    tenantId,
    clientId: null,
    'clientData.lead.source': 'vk_group',
    'clientData.lead.vkUserId': { $nin: ['', null] },
  })
    .sort({ updatedAt: -1 })
    .limit(500)

  for (const event of events) {
    const vkUserId = event.clientData?.lead?.vkUserId
    const client = await upsertVkLeadClient({
      tenantId,
      normalized: {
        vkUserId,
        name: event.clientData?.lead?.name || `Клиент VK ${vkUserId}`,
      },
    })
    if (!client?._id) continue
    event.clientId = client._id
    await event.save()
    eventsUpdated += 1

    if (event.clientData?.lead?.vkPeerId) {
      await VkConversations.updateOne(
        {
          tenantId,
          vkPeerId: event.clientData.lead.vkPeerId,
          clientId: null,
        },
        { $set: { clientId: client._id } }
      )
    }
  }

  const clientsWithVkLinks = await Clients.find({
    tenantId,
    vk: /^https?:\/\/(www\.)?(m\.)?vk\.(com|ru)\//i,
  }).limit(500)

  for (const client of clientsWithVkLinks) {
    const normalizedVk = normalizeStoredVkContact(client.vk)
    if (!normalizedVk || normalizedVk === client.vk) continue
    client.vk = normalizedVk
    await client.save()
    clientsUpdated += 1
  }

  return { clientsUpdated, conversationsUpdated, eventsUpdated }
}

const updateVkCustom = async ({ tenantId, patch }) => {
  return SiteSettings.findOneAndUpdate(
    { tenantId },
    { $set: { tenantId, ...siteSettingsCustomPaths(patch) } },
    { upsert: true, returnDocument: 'after' }
  ).lean()
}

export {
  buildVkWebhookUrl,
  backfillVkLeadClients,
  checkVkGroupAccess,
  createOrUpdateVkLead,
  createVkWebhookSecret,
  createVkWebhookToken,
  getVkUserProfile,
  normalizeStoredVkContact,
  normalizeVkSettings,
  sendVkMessage,
  updateVkCustom,
}
