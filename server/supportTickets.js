import mongoose from 'mongoose'
import Users from '@models/Users'
import {
  uploadFilesToEscalionCloud,
  extractEscalionCloudUploadUrl,
} from './escalionCloud.js'
import { sendMultiChannelPushToTenant } from './multiChannelPush.js'
import { buildSupportNotificationPayload } from './supportTicketCore.js'

export * from './supportTicketCore.js'

const safeFileName = (name, index) => {
  const cleaned = String(name || `image-${index + 1}`)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .slice(0, 200)
  return cleaned || `image-${index + 1}`
}

export const uploadSupportAttachments = async ({
  files,
  tenantId,
  ticketId,
}) => {
  if (!files.length) return []
  const renamedFiles = files.map(
    (file, index) =>
      new File([file], safeFileName(file.name, index), { type: file.type })
  )
  const uploaded = await uploadFilesToEscalionCloud({
    files: renamedFiles,
    directory: `artistcrm/${tenantId}/support-tickets/${ticketId}`,
  })
  if (uploaded.length !== files.length)
    throw new Error('CLOUD_FILE_COUNT_MISMATCH')
  return uploaded.map((row, index) => {
    const url = extractEscalionCloudUploadUrl(row)
    if (!url) throw new Error('CLOUD_FILE_URL_INVALID')
    return {
      url,
      name: renamedFiles[index].name,
      size: files[index].size,
      type: files[index].type,
      uploadedAt: new Date(),
    }
  })
}

export const notifySupportMessage = async ({
  ticket,
  actorRole,
  isNewTicket = false,
}) => {
  const id = String(ticket._id)
  const payload = buildSupportNotificationPayload({
    ticket,
    actorRole,
    isNewTicket,
  })
  try {
    if (actorRole === 'developer') {
      await sendMultiChannelPushToTenant({
        tenantId: ticket.tenantId,
        payload,
        source: 'support',
      })
      return
    }
    const developers = await Users.find({ role: 'dev', archive: { $ne: true } })
      .select('_id tenantId')
      .lean()
    const tenantIds = [
      ...new Set(
        developers
          .map((item) => String(item.tenantId || item._id))
          .filter(Boolean)
      ),
    ]
    await Promise.all(
      tenantIds.map((tenantId) =>
        sendMultiChannelPushToTenant({ tenantId, payload, source: 'support' })
      )
    )
  } catch (error) {
    console.warn('support push failed', { ticketId: id, error: error?.message })
  }
}

export const createSupportObjectId = () => new mongoose.Types.ObjectId()
