import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import { requireTelegramQuestionnaireAccess } from '@server/integrationAccess'
import { normalizeTelegramSettings } from '@server/telegramBusiness'
import { QUESTIONNAIRE_ATTACHMENT_ID, readTelegramQuestionnaire } from '@server/telegramQuestionnaireSettings'
import { armTelegramQuestionnaireTest, listTelegramQuestionnaireTests } from '@server/telegramQuestionnaireTestRuns'

const error = (message, status) => NextResponse.json({ error: { message } }, { status })

const loadSetup = async (tenantId) => {
  await dbConnect()
  const [site, questionnaire] = await Promise.all([
    SiteSettings.findOne({ tenantId }).lean(), readTelegramQuestionnaire(tenantId),
  ])
  const settings = normalizeTelegramSettings(site?.custom)
  return { tenantId, questionnaire, businessConnectionId: settings.enabled ? settings.businessConnectionId : '' }
}

export const GET = async (req) => {
  const access = await requireTelegramQuestionnaireAccess(req)
  if (!access.ok) return error(access.error, access.status)
  const query = new URL(req.url).searchParams.get('q')?.trim().slice(0, 80) ?? ''
  const data = await listTelegramQuestionnaireTests({ ...await loadSetup(access.tenantId), query })
  return NextResponse.json(data)
}

export const POST = async (req) => {
  const access = await requireTelegramQuestionnaireAccess(req)
  if (!access.ok) return error(access.error, access.status)
  const body = await req.json().catch(() => null)
  if (typeof body?.chatId !== 'string' || !QUESTIONNAIRE_ATTACHMENT_ID.test(body.chatId) || typeof body.createDraft !== 'boolean') {
    return error('Выберите тестовый диалог Telegram', 400)
  }
  try {
    const setup = await loadSetup(access.tenantId)
    if (!setup.businessConnectionId) return error('Подключите Telegram Business', 409)
    const run = await armTelegramQuestionnaireTest({ ...setup, chatId: body.chatId, createDraft: body.createDraft })
    return NextResponse.json({ run }, { status: 201 })
  } catch (cause) {
    return [404, 409].includes(cause?.status) ? error(cause.message, cause.status) : error('Не удалось запустить тест', 500)
  }
}
