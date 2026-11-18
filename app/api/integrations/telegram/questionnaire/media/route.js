import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import { requireTelegramQuestionnaireAccess } from '@server/integrationAccess'
import {
  QUESTIONNAIRE_UPLOAD_LIMIT,
  deleteTelegramQuestionnaireMedia,
  uploadTelegramQuestionnaireMedia,
} from '@server/telegramQuestionnaireMedia'
import {
  QUESTIONNAIRE_MEDIA_LIMIT,
  appendTelegramQuestionnaireMedia,
  readTelegramQuestionnaire,
} from '@server/telegramQuestionnaireSettings'

const error = (message, status) => NextResponse.json({ error: { message } }, { status })

export const POST = async (req) => {
  const access = await requireTelegramQuestionnaireAccess(req)
  if (!access.ok) return error(access.error, access.status)
  const limit = QUESTIONNAIRE_UPLOAD_LIMIT + 64 * 1024
  if (Number(req.headers.get('content-length')) > limit) {
    return error('Файл превышает максимально допустимый размер', 413)
  }
  let size = 0
  const body = req.body?.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength
      if (size > limit) controller.error(new Error('Upload exceeds size limit'))
      else controller.enqueue(chunk)
    },
  }))
  const form = await new Response(body, {
    headers: { 'Content-Type': req.headers.get('content-type') ?? '' },
  }).formData().catch(() => null)
  if (size > limit) return error('Файл превышает максимально допустимый размер', 413)
  const revisionValue = form?.get('revision')
  const revision = Number(revisionValue)
  if (typeof revisionValue !== 'string' || !/^\d+$/.test(revisionValue) || !Number.isSafeInteger(revision)) {
    return error('Откройте актуальные настройки автоответчика', 400)
  }
  const { tenantId } = access
  await dbConnect()
  const current = await readTelegramQuestionnaire(tenantId)
  if (current.revision !== revision) return error('Настройки обновились. Откройте их заново и повторите загрузку', 409)
  if (current.media.length >= QUESTIONNAIRE_MEDIA_LIMIT) return error(`Можно добавить до ${QUESTIONNAIRE_MEDIA_LIMIT} фото и видео`, 409)
  let attachment
  try {
    attachment = await uploadTelegramQuestionnaireMedia({ tenantId, file: form.get('file'), type: form.get('type') })
    const questionnaire = await appendTelegramQuestionnaireMedia({ tenantId, revision, attachment })
    return NextResponse.json({ attachment, questionnaire }, { status: 201 })
  } catch (cause) {
    if (attachment) {
      const persisted = await readTelegramQuestionnaire(tenantId).catch(() => null)
      if (persisted?.media.some(({ id }) => id === attachment.id)) {
        return NextResponse.json({ attachment, questionnaire: persisted }, { status: 201 })
      }
      if (persisted) await deleteTelegramQuestionnaireMedia({ tenantId, id: attachment.id }).catch(() => {})
    }
    return [400, 409, 413].includes(cause?.status)
      ? error(cause.message, cause.status)
      : error('Не удалось загрузить файл. Повторите попытку', 500)
  }
}
