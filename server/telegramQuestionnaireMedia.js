import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import mongoose from 'mongoose'
import sharp from 'sharp'
import {
  saveTelegramBusinessMessage,
  sendTelegramBusinessMedia,
} from '@server/telegramBusiness'
import {
  QUESTIONNAIRE_ATTACHMENT_ID,
  questionnaireError,
} from '@server/telegramQuestionnaireSettings'

const MEDIA_PATH = '/api/integrations/telegram/questionnaire/media'
const MEDIA_TTL_SECONDS = 5 * 60
const MiB = 1024 * 1024
export const QUESTIONNAIRE_UPLOAD_LIMIT = 20 * MiB

const mediaBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
  bucketName: 'telegramQuestionnaireMedia',
})

const safeFileName = (file, extension) => {
  const base = file.name.split(/[\\/]/).pop().replace(/\.[^.]*$/, '')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().slice(0, 120)
  return `${base || 'telegram'}.${extension}`
}

const validateFile = async (file, type) => {
  if (!(file instanceof File) || !file.size) throw questionnaireError('Выберите файл')
  if (type === 'video') {
    if (file.size > QUESTIONNAIRE_UPLOAD_LIMIT) throw questionnaireError('Видео должно быть до 20 МБ', 413)
    const header = Buffer.from(await file.slice(0, 12).arrayBuffer())
    if (!/\.mp4$/i.test(file.name) || header.toString('ascii', 4, 8) !== 'ftyp') {
      throw questionnaireError('Выберите видео в формате MP4')
    }
    return { extension: 'mp4', contentType: 'video/mp4' }
  }
  if (type !== 'photo') throw questionnaireError('Выберите фото или видео')
  if (file.size > 5 * MiB) throw questionnaireError('Фото должно быть до 5 МБ', 413)
  const bytes = Buffer.from(await file.arrayBuffer())
  const image = await sharp(bytes, { limitInputPixels: 25_000_000 }).metadata().catch(() => null)
  if (!image || !['jpeg', 'png'].includes(image.format)) throw questionnaireError('Выберите изображение JPG или PNG')
  const { width, height } = image
  if (!width || !height || width + height > 10_000 || Math.max(width, height) > 20 * Math.min(width, height)) {
    throw questionnaireError('Размеры изображения не подходят для отправки в Telegram')
  }
  return { extension: image.format === 'jpeg' ? 'jpg' : 'png', contentType: `image/${image.format}` }
}

export const uploadTelegramQuestionnaireMedia = async ({ tenantId, file, type }) => {
  const { extension, contentType } = await validateFile(file, type)
  const name = safeFileName(file, extension)
  const stream = mediaBucket().openUploadStream(name, {
    metadata: { tenantId: String(tenantId), type, contentType },
  })
  await pipeline(Readable.fromWeb(file.stream()), stream)
  return { id: String(stream.id), name, type }
}

export const findTelegramQuestionnaireMedia = async (id, tenantId) => {
  if (!QUESTIONNAIRE_ATTACHMENT_ID.test(id)) return null
  return mediaBucket().find({
    _id: new mongoose.Types.ObjectId(id),
    ...(tenantId ? { 'metadata.tenantId': String(tenantId) } : {}),
  }).limit(1).next()
}

export const deleteTelegramQuestionnaireMedia = async ({ tenantId, id }) => {
  const file = await findTelegramQuestionnaireMedia(id, tenantId)
  if (file) await mediaBucket().delete(file._id)
}

const signature = ({ tenantId, id, expires, secret }) =>
  crypto.createHmac('sha256', secret).update(`${tenantId}:${id}:${expires}`).digest('hex')

export const verifyTelegramQuestionnaireMediaSignature = ({ tenantId, id, expires, token, secret }) => {
  if (!secret || !/^\d{10}$/.test(expires) || !/^[a-f0-9]{64}$/.test(token)) return false
  const now = Math.floor(Date.now() / 1000)
  if (Number(expires) <= now || Number(expires) > now + MEDIA_TTL_SECONDS) return false
  return crypto.timingSafeEqual(
    Buffer.from(token, 'hex'),
    Buffer.from(signature({ tenantId, id, expires, secret }), 'hex')
  )
}

const buildPrivateMediaUrl = ({ tenantId, id, settings }) => {
  const url = new URL(`${MEDIA_PATH}/${id}`, settings.webhookUrl)
  const expires = Math.floor(Date.now() / 1000) + MEDIA_TTL_SECONDS
  const token = signature({ tenantId, id, expires, secret: settings.webhookSecret })
  url.search = new URLSearchParams({ expires: String(expires), token }).toString()
  return url.href
}

export const telegramQuestionnaireMediaResponse = (file, head) => new Response(
  head ? null : Readable.toWeb(mediaBucket().openDownloadStream(file._id)),
  {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': file.metadata.contentType,
      'Content-Length': String(file.length),
      'X-Content-Type-Options': 'nosniff',
    },
  }
)

export const sendTelegramQuestionnaireMedia = async ({ tenantId, settings, chatId, media }) => {
  if (!media?.length) return
  const attachments = media.map(({ id, type, url }) => ({
    type,
    url: id ? buildPrivateMediaUrl({ tenantId, id, settings }) : url,
  }))
  const sent = await sendTelegramBusinessMedia({
    botToken: settings.botToken,
    businessConnectionId: settings.businessConnectionId,
    chatId,
    media: attachments,
  })
  for (const message of sent ?? []) {
    await saveTelegramBusinessMessage({
      tenantId, settings, message: { ...message, business_connection_id: settings.businessConnectionId },
    })
  }
}
