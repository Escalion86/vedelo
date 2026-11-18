import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import { requireTelegramQuestionnaireAccess } from '@server/integrationAccess'
import { buildTelegramWebhookUrl, normalizeTelegramSettings, setTelegramWebhook } from '@server/telegramBusiness'
import { deleteTelegramQuestionnaireMedia } from '@server/telegramQuestionnaireMedia'
import {
  readTelegramQuestionnaire,
  saveTelegramQuestionnaire,
  validateTelegramQuestionnaire,
} from '@server/telegramQuestionnaireSettings'

const error = (message, status) => NextResponse.json({ error: { message } }, { status })

export const GET = async (req) => {
  const access = await requireTelegramQuestionnaireAccess(req)
  if (!access.ok) return error(access.error, access.status)
  await dbConnect()
  const questionnaire = await readTelegramQuestionnaire(access.tenantId)
  return NextResponse.json({ questionnaire })
}

export const PATCH = async (req) => {
  const access = await requireTelegramQuestionnaireAccess(req)
  if (!access.ok) return error(access.error, access.status)
  const body = await req.json().catch(() => null)
  if (!Number.isSafeInteger(body?.revision) || body.revision < 0) {
    return error('Откройте актуальные настройки автоответчика', 400)
  }
  const { tenantId } = access
  await dbConnect()
  const current = await readTelegramQuestionnaire(tenantId)
  if (body.revision !== current.revision) {
    return error('Настройки обновились. Откройте их заново и повторите изменения', 409)
  }
  try {
    const next = validateTelegramQuestionnaire(body, current.media)
    if (next.enabled && !current.enabled) {
      const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
      const telegram = normalizeTelegramSettings(siteSettings?.custom)
      if (!telegram.enabled || !telegram.businessConnectionId || !telegram.botToken || !telegram.webhookToken || !telegram.webhookSecret) {
        return error('Сначала подключите бота к аккаунту Telegram Business', 409)
      }
      if (telegram.rights && telegram.rights.can_reply !== true) {
        return error('Дайте боту право отвечать на сообщения в Telegram Business', 409)
      }
      try {
        await setTelegramWebhook({
          botToken: telegram.botToken,
          webhookUrl: telegram.webhookUrl || buildTelegramWebhookUrl({ req, token: telegram.webhookToken }),
          webhookSecret: telegram.webhookSecret,
        })
      } catch {
        return error('Telegram не принял настройки кнопок. Проверьте подключение и повторите попытку', 502)
      }
    }
    const questionnaire = await saveTelegramQuestionnaire({ tenantId, revision: current.revision, questionnaire: next })
    const retained = new Set(next.media.map(({ id }) => id))
    const removed = current.media.filter(({ id }) => id && !retained.has(id))
    await Promise.allSettled(removed.map(({ id }) => deleteTelegramQuestionnaireMedia({ tenantId, id })))
    return NextResponse.json({ questionnaire })
  } catch (cause) {
    return cause?.status === 400 || cause?.status === 409
      ? error(cause.message, cause.status)
      : error('Не удалось сохранить настройки автоответчика', 500)
  }
}
