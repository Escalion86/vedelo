import crypto from 'crypto'
import dns from 'dns'
import {
  Agent as UndiciAgent,
  ProxyAgent,
  Socks5ProxyAgent,
  fetch as undiciFetch,
} from 'undici'
import Clients from '@models/Clients'
import SiteSettings from '@models/SiteSettings'
import TelegramConversations from '@models/TelegramConversations'
import TelegramMessages from '@models/TelegramMessages'
import { getTelegramBusinessMessageDirection } from '@helpers/telegramBusinessMessage'

const TELEGRAM_API_BASE = 'https://api.telegram.org'
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000
const TELEGRAM_REQUEST_TIMEOUT_MS = 15_000

const lookupIPv4 = (hostname, options, callback) => {
  if (typeof options === 'function') {
    return dns.lookup(hostname, { family: 4 }, options)
  }
  return dns.lookup(hostname, { ...(options || {}), family: 4 }, callback)
}

const createTelegramTransport = () => {
  const proxyUrl = String(process.env.TELEGRAM_PROXY_URL || '').trim()
  if (!proxyUrl) {
    return {
      dispatcher: new UndiciAgent({
        connect: { lookup: lookupIPv4, family: 4 },
      }),
      proxyEnabled: false,
      proxyType: 'direct',
      configError: '',
    }
  }

  try {
    const protocol = new URL(proxyUrl).protocol.toLowerCase()
    if (['http:', 'https:'].includes(protocol)) {
      return {
        dispatcher: new ProxyAgent(proxyUrl),
        proxyEnabled: true,
        proxyType: protocol.slice(0, -1),
        configError: '',
      }
    }
    if (['socks5:', 'socks5h:'].includes(protocol)) {
      return {
        dispatcher: new Socks5ProxyAgent(proxyUrl),
        proxyEnabled: true,
        proxyType: protocol.slice(0, -1),
        configError: '',
      }
    }
    return {
      dispatcher: null,
      proxyEnabled: true,
      proxyType: 'invalid',
      configError:
        'TELEGRAM_PROXY_URL поддерживает только http://, https:// и socks5://',
    }
  } catch {
    return {
      dispatcher: null,
      proxyEnabled: true,
      proxyType: 'invalid',
      configError: 'Некорректный формат TELEGRAM_PROXY_URL',
    }
  }
}

const telegramTransport = createTelegramTransport()

const getNetworkErrorCode = (error) => {
  let current = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current?.code) return String(current.code)
    current = current?.cause
  }
  return ''
}

const getTelegramNetworkErrorMessage = (cause) => {
  const code = getNetworkErrorCode(cause)
  if (!telegramTransport.proxyEnabled) {
    return code
      ? `Сервер не может подключиться к Telegram API (${code})`
      : 'Сервер не может подключиться к Telegram API'
  }
  if (code === 'ECONNREFUSED') {
    return 'Прокси отклонил соединение (ECONNREFUSED). Проверьте, что порт прокси доступен из процесса или контейнера Ведело.'
  }
  if (
    [
      'ETIMEDOUT',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_HEADERS_TIMEOUT',
    ].includes(code)
  ) {
    return `Истекло время подключения к Telegram через прокси (${code})`
  }
  if (code === 'ECONNRESET') {
    return 'Прокси разорвал соединение с Telegram (ECONNRESET)'
  }
  return code
    ? `Не удалось подключиться к Telegram API через прокси (${code})`
    : 'Не удалось подключиться к Telegram API через настроенный прокси'
}

export const getTelegramTransportStatus = () => ({
  proxyEnabled: telegramTransport.proxyEnabled,
  proxyType: telegramTransport.proxyType,
  configError: telegramTransport.configError,
})

const readCustom = (custom, key) =>
  typeof custom?.get === 'function' ? custom.get(key) : custom?.[key]

const getBaseUrl = (req) => {
  const configured = String(process.env.DOMAIN || '').trim()
  if (configured) {
    return configured.startsWith('http')
      ? configured.replace(/\/$/, '')
      : `https://${configured.replace(/\/$/, '')}`
  }
  return new URL(req.url).origin
}

const telegramRequest = async ({ botToken, method, body = {} }) => {
  if (telegramTransport.configError || !telegramTransport.dispatcher) {
    const error = new Error(telegramTransport.configError)
    error.code = 'telegram_proxy_invalid'
    throw error
  }

  let response
  try {
    response = await undiciFetch(
      `${TELEGRAM_API_BASE}/bot${botToken}/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        dispatcher: telegramTransport.dispatcher,
        signal: AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MS),
      }
    )
  } catch (cause) {
    const error = new Error(getTelegramNetworkErrorMessage(cause))
    error.code = telegramTransport.proxyEnabled
      ? 'telegram_proxy_unavailable'
      : 'telegram_api_unavailable'
    error.cause = cause
    throw error
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.description || 'Telegram API error')
    error.status = response.status
    error.telegramCode = payload?.error_code
    throw error
  }
  return payload?.result
}

export const createTelegramWebhookToken = () =>
  `tgb_${crypto.randomBytes(24).toString('hex')}`

export const createTelegramWebhookSecret = () =>
  `tgsec_${crypto.randomBytes(24).toString('hex')}`

export const buildTelegramWebhookUrl = ({ req, token }) =>
  `${getBaseUrl(req)}/api/integrations/telegram/webhook/${encodeURIComponent(token)}`

export const normalizeTelegramSettings = (custom) => ({
  enabled: Boolean(readCustom(custom, 'telegramBusinessEnabled')),
  autoCreateClients:
    readCustom(custom, 'telegramBusinessAutoCreateClients') === true,
  botToken: String(readCustom(custom, 'telegramBusinessBotToken') || ''),
  botId: String(readCustom(custom, 'telegramBusinessBotId') || ''),
  botUsername: String(readCustom(custom, 'telegramBusinessBotUsername') || ''),
  webhookToken: String(
    readCustom(custom, 'telegramBusinessWebhookToken') || ''
  ),
  webhookSecret: String(
    readCustom(custom, 'telegramBusinessWebhookSecret') || ''
  ),
  webhookUrl: String(readCustom(custom, 'telegramBusinessWebhookUrl') || ''),
  businessConnectionId: String(
    readCustom(custom, 'telegramBusinessConnectionId') || ''
  ),
  businessAccountUserId: String(
    readCustom(custom, 'telegramBusinessAccountUserId') || ''
  ),
  status: String(readCustom(custom, 'telegramBusinessStatus') || 'disabled'),
  lastError: String(readCustom(custom, 'telegramBusinessLastError') || ''),
  connectedAt: readCustom(custom, 'telegramBusinessConnectedAt') || null,
  lastCheckedAt: readCustom(custom, 'telegramBusinessLastCheckedAt') || null,
  lastWebhookAt: readCustom(custom, 'telegramBusinessLastWebhookAt') || null,
  lastMessageAt: readCustom(custom, 'telegramBusinessLastMessageAt') || null,
  rights: readCustom(custom, 'telegramBusinessRights') || null,
})

export const sanitizeTelegramSiteSettings = (siteSettings) => {
  if (!siteSettings) return siteSettings
  const source =
    typeof siteSettings?.toObject === 'function'
      ? siteSettings.toObject()
      : { ...siteSettings }
  const custom = source.custom ?? {}
  const normalizedCustom =
    typeof custom?.get === 'function'
      ? Object.fromEntries(custom)
      : { ...custom }
  delete normalizedCustom.telegramBusinessBotToken
  delete normalizedCustom.telegramBusinessWebhookToken
  delete normalizedCustom.telegramBusinessWebhookSecret
  delete normalizedCustom.telegramBusinessWebhookUrl
  delete normalizedCustom.telegramBusinessConnectionId
  delete normalizedCustom.telegramBusinessAccountUserId
  delete normalizedCustom.telegramBusinessRights
  return { ...source, custom: normalizedCustom }
}

export const updateTelegramCustom = async ({ tenantId, patch }) => {
  const current = await SiteSettings.findOne({ tenantId }).lean()
  const custom = current?.custom ?? {}
  const normalizedCustom =
    typeof custom?.get === 'function' ? Object.fromEntries(custom) : custom

  return SiteSettings.findOneAndUpdate(
    { tenantId },
    { $set: { tenantId, custom: { ...normalizedCustom, ...patch } } },
    { upsert: true, returnDocument: 'after' }
  ).lean()
}

export const checkTelegramBot = ({ botToken }) =>
  telegramRequest({ botToken, method: 'getMe' })

export const setTelegramWebhook = ({ botToken, webhookUrl, webhookSecret }) =>
  telegramRequest({
    botToken,
    method: 'setWebhook',
    body: {
      url: webhookUrl,
      secret_token: webhookSecret,
      allowed_updates: [
        'business_connection',
        'business_message',
        'edited_business_message',
        'deleted_business_messages',
      ],
      drop_pending_updates: false,
    },
  })

export const deleteTelegramWebhook = ({ botToken }) =>
  telegramRequest({
    botToken,
    method: 'deleteWebhook',
    body: { drop_pending_updates: false },
  })

export const sendTelegramBusinessMessage = ({
  botToken,
  businessConnectionId,
  chatId,
  text,
}) =>
  telegramRequest({
    botToken,
    method: 'sendMessage',
    body: {
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      text,
    },
  })

export const sendTelegramBusinessMedia = ({
  botToken,
  businessConnectionId,
  chatId,
  media,
}) => {
  const items = (Array.isArray(media) ? media : []).slice(0, 10)
  if (!items.length) return Promise.resolve([])
  if (items.length === 1) {
    const item = items[0]
    return telegramRequest({
      botToken,
      method: item.type === 'video' ? 'sendVideo' : 'sendPhoto',
      body: {
        business_connection_id: businessConnectionId,
        chat_id: chatId,
        [item.type === 'video' ? 'video' : 'photo']: item.url,
      },
    }).then((message) => [message])
  }
  return telegramRequest({
    botToken,
    method: 'sendMediaGroup',
    body: {
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      media: items.map((item) => ({
        type: item.type === 'video' ? 'video' : 'photo',
        media: item.url,
      })),
    },
  })
}

const normalizeUsername = (value) =>
  String(value || '')
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i, '')
    .replace(/\/$/, '')
    .toLowerCase()

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const getMessageText = (message) => {
  const text = String(message?.text || message?.caption || '').trim()
  if (text) return text.slice(0, 4000)
  if (message?.photo) return '[Фото]'
  if (message?.video) return '[Видео]'
  if (message?.voice) return '[Голосовое сообщение]'
  if (message?.audio) return '[Аудио]'
  if (message?.document) return '[Файл]'
  if (message?.sticker) return '[Стикер]'
  if (message?.location) return '[Геопозиция]'
  if (message?.contact) return '[Контакт]'
  return '[Сообщение]'
}

const getAttachments = (message) => {
  const attachments = []
  const push = (type, value) => {
    if (!value?.file_id) return
    attachments.push({
      type,
      fileId: value.file_id,
      fileName: value.file_name || '',
      fileSize: value.file_size || 0,
      mimeType: value.mime_type || '',
    })
  }
  if (Array.isArray(message?.photo) && message.photo.length) {
    push('photo', message.photo[message.photo.length - 1])
  }
  push('video', message?.video)
  push('voice', message?.voice)
  push('audio', message?.audio)
  push('document', message?.document)
  push('sticker', message?.sticker)
  return attachments
}

const findOrCreateTelegramClient = async ({
  tenantId,
  message,
  autoCreateClients,
}) => {
  const peer = message?.chat || message?.from || {}
  const telegramUserId = String(peer?.id || message?.from?.id || '')
  const username = normalizeUsername(peer?.username || message?.from?.username)
  let created = false

  let client = telegramUserId
    ? await Clients.findOne({ tenantId, telegramUserId })
    : null

  if (!client && username) {
    client = await Clients.findOne({
      tenantId,
      telegram: {
        $regex: `^(?:@|https?://(?:www\\.)?(?:t\\.me|telegram\\.me)/)?${escapeRegExp(username)}/?$`,
        $options: 'i',
      },
    })
  }

  if (!client) {
    if (!autoCreateClients) return { client: null, created: false }
    client = await Clients.create({
      tenantId,
      firstName: String(
        peer?.first_name || message?.from?.first_name || 'Клиент'
      ).slice(0, 100),
      secondName: String(
        peer?.last_name || message?.from?.last_name || ''
      ).slice(0, 100),
      telegram: username,
      telegramUserId,
      role: 'client',
    })
    created = true
  } else {
    let changed = false
    if (telegramUserId && !client.telegramUserId) {
      client.telegramUserId = telegramUserId
      changed = true
    }
    if (username && !client.telegram) {
      client.telegram = username
      changed = true
    }
    if (changed) await client.save()
  }

  return { client, created }
}

export const saveTelegramBusinessMessage = async ({
  tenantId,
  settings,
  message,
}) => {
  const chatId = String(message?.chat?.id || '')
  const messageId = String(message?.message_id || '')
  const connectionId = String(message?.business_connection_id || '')
  if (!chatId || !messageId || !connectionId) return null

  const direction = getTelegramBusinessMessageDirection({
    message,
    businessAccountUserId: settings?.businessAccountUserId,
  })
  const { client, created: clientCreated } = await findOrCreateTelegramClient({
    tenantId,
    message,
    autoCreateClients: settings?.autoCreateClients === true,
  })
  const sentAt = message?.date
    ? new Date(Number(message.date) * 1000)
    : new Date()
  const text = getMessageText(message)
  const username = normalizeUsername(
    message?.chat?.username || message?.from?.username
  )
  const clientName = [
    message?.chat?.first_name || message?.from?.first_name,
    message?.chat?.last_name || message?.from?.last_name,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 200)
  const existingMessage = await TelegramMessages.exists({
    tenantId,
    telegramChatId: chatId,
    telegramMessageId: messageId,
  })

  const conversation = await TelegramConversations.findOneAndUpdate(
    { tenantId, telegramChatId: chatId },
    {
      $set: {
        clientId: client?._id ?? null,
        businessConnectionId: connectionId,
        telegramUserId: String(message?.chat?.id || message?.from?.id || ''),
        telegramUsername: username,
        clientName,
        lastMessageText: text,
        lastMessageAt: sentAt,
        ...(direction === 'incoming' ? { lastIncomingAt: sentAt } : {}),
      },
      ...(direction === 'incoming' && !existingMessage
        ? { $inc: { unreadCount: 1 } }
        : {}),
      $setOnInsert: { status: 'open' },
    },
    { upsert: true, returnDocument: 'after' }
  )

  const messageStatus = direction === 'incoming' ? 'received' : 'sent'
  const savedMessage = await TelegramMessages.findOneAndUpdate(
    { tenantId, telegramChatId: chatId, telegramMessageId: messageId },
    {
      $set: {
        conversationId: conversation._id,
        clientId: client?._id ?? null,
        eventId: conversation.eventId ?? null,
        businessConnectionId: connectionId,
        direction,
        text,
        attachments: getAttachments(message),
        sentAt,
        status: messageStatus,
      },
    },
    { upsert: true, returnDocument: 'after' }
  )

  return {
    conversation,
    message: savedMessage,
    client,
    clientCreated,
    direction,
    isNewMessage: !existingMessage,
  }
}

export const isTelegramReplyWindowOpen = (lastIncomingAt, now = Date.now()) => {
  const timestamp = new Date(lastIncomingAt || 0).getTime()
  return Number.isFinite(timestamp) && now - timestamp <= REPLY_WINDOW_MS
}
