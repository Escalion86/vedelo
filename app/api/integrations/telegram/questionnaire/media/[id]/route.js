import SiteSettings from '@models/SiteSettings'
import TelegramQuestionnaires from '@models/TelegramQuestionnaires'
import dbConnect from '@server/dbConnect'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { hasTelegramQuestionnaireAccess } from '@server/integrationAccess'
import { normalizeTelegramSettings } from '@server/telegramBusiness'
import {
  findTelegramQuestionnaireMedia,
  telegramQuestionnaireMediaResponse,
  verifyTelegramQuestionnaireMediaSignature,
} from '@server/telegramQuestionnaireMedia'
import { QUESTIONNAIRE_ATTACHMENT_ID, readTelegramQuestionnaire } from '@server/telegramQuestionnaireSettings'

const notFound = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })

const respond = async (req, { params }, head) => {
  const { id } = await params
  const query = new URL(req.url).searchParams
  const expires = query.get('expires') ?? ''
  const token = query.get('token') ?? ''
  if (!QUESTIONNAIRE_ATTACHMENT_ID.test(id) || !/^\d{10}$/.test(expires) || !/^[a-f0-9]{64}$/.test(token)) return notFound()

  await dbConnect()
  const file = await findTelegramQuestionnaireMedia(id)
  const tenantId = file?.metadata?.tenantId
  if (!tenantId) return notFound()
  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const telegram = normalizeTelegramSettings(siteSettings?.custom)
  if (!telegram.enabled || !telegram.businessConnectionId || !verifyTelegramQuestionnaireMediaSignature({
    tenantId, id, expires, token, secret: telegram.webhookSecret,
  })) return notFound()
  if (!hasTelegramQuestionnaireAccess(await getUserTariffAccess(tenantId))) return notFound()
  const questionnaire = await readTelegramQuestionnaire(tenantId)
  if (!questionnaire.enabled) return notFound()
  if (!questionnaire.media.some((item) => item.id === id) && !await TelegramQuestionnaires.exists({
    tenantId, businessConnectionId: telegram.businessConnectionId, 'scenarioMedia.id': id,
  })) return notFound()
  return telegramQuestionnaireMediaResponse(file, head)
}

export const GET = (req, context) => respond(req, context, false)
export const HEAD = (req, context) => respond(req, context, true)
