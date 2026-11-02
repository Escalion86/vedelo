import crypto from 'node:crypto'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { generateWebDocument } from '@server/webDocumentGeneration'
import { EntityDocumentError } from '@server/entityDocumentFiles'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'

export const runtime = 'nodejs'

// Preserve the old response envelope. New APKs persist requestId before dispatch;
// old APKs retain one-operation-per-request semantics.
export const POST = async (req, { params }) => {
  try {
    const context = await getRequestContext(req)
    if (!context.user?._id || !context.tenantId)
      return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
    const { id } = await params
    const input = await req.json().catch(() => null)
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return mobileError('BODY_INVALID', 'Некорректный запрос', 400)
    const access = await getUserTariffAccess(context.user._id)
    await dbConnect()
    const result = await generateWebDocument({
      eventId: id,
      tenantId: context.tenantId,
      user: context.user,
      access,
      body: {
        templateId: input.templateId,
        documentDate: input.documentDate,
        requestId: input.requestId === undefined ? crypto.randomUUID() : input.requestId,
        action: input.action,
        source: input.source,
        // Legacy forms had no empty-fields confirmation.
        allowEmpty: input.requestId === undefined || input.allowEmpty === true,
      },
    })
    return mobileSuccess({ ...result, ...(result.entity ? { event: result.entity } : {}) })
  } catch (error) {
    return mobileError(
      error instanceof EntityDocumentError ? error.code : 'GENERATION_FAILED',
      error instanceof EntityDocumentError ? error.message : 'Не удалось создать документ. Повторите попытку.',
      error instanceof EntityDocumentError ? error.status : 500
    )
  }
}
