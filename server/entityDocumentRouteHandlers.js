import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  deleteEntityDocument,
  EntityDocumentError,
  getEntityDocumentAccess,
  uploadEntityDocument,
} from '@server/entityDocumentFiles'

const errorResponse = (error, mobile) => {
  const status = Number(error?.status) || 500
  const code = error?.code || 'DOCUMENT_OPERATION_FAILED'
  const message =
    error instanceof EntityDocumentError || error?.code
      ? error.message
      : 'Не удалось выполнить операцию с документом'
  return NextResponse.json(
    mobile
      ? {
          success: false,
          error: { code, message, field: error?.field || undefined },
        }
      : { success: false, error: message, code },
    { status }
  )
}

const successResponse = (data) =>
  NextResponse.json({ success: true, data }, { status: 200 })

const getOperationContext = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId) {
    throw new EntityDocumentError('UNAUTHORIZED', 'Не авторизован', 401)
  }
  const access = await getUserTariffAccess(context.user._id)
  await dbConnect()
  return { context, access }
}

const safeMobileEntity = (entity) => {
  if (!entity || typeof entity !== 'object') return entity
  const {
    tenantId,
    clientData,
    googleCalendarResponse,
    raw,
    password,
    notifications,
    ...safe
  } = entity
  return safe
}

export const handleEntityDocumentUpload = async (
  req,
  params,
  entityType,
  { mobile = false } = {}
) => {
  try {
    const { id } = await params
    const [{ context, access }, formData] = await Promise.all([
      getOperationContext(req),
      req.formData().catch(() => null),
    ])
    if (!formData) {
      throw new EntityDocumentError('FILE_REQUIRED', 'Передайте один файл', 400)
    }
    const result = await uploadEntityDocument({
      formData,
      entityType,
      entityId: id,
      tenantId: context.tenantId,
      access,
    })
    return successResponse({
      ...result,
      ...(mobile ? { entity: safeMobileEntity(result.entity) } : {}),
    })
  } catch (error) {
    return errorResponse(error, mobile)
  }
}

export const handleEntityDocumentAccess = async (
  req,
  params,
  entityType,
  { mobile = false } = {}
) => {
  try {
    const { id } = await params
    const [{ context, access }, body] = await Promise.all([
      getOperationContext(req),
      req.json().catch(() => ({})),
    ])
    const result = await getEntityDocumentAccess({
      entityType,
      entityId: id,
      documentId: body.documentId,
      tenantId: context.tenantId,
      access,
      disposition: body.disposition,
    })
    return successResponse(result)
  } catch (error) {
    return errorResponse(error, mobile)
  }
}

export const handleEntityDocumentDelete = async (
  req,
  params,
  entityType,
  { mobile = false } = {}
) => {
  try {
    const { id } = await params
    const [{ context, access }, body] = await Promise.all([
      getOperationContext(req),
      req.json().catch(() => ({})),
    ])
    const result = await deleteEntityDocument({
      entityType,
      entityId: id,
      documentId: body.documentId,
      deleteId: body.deleteId,
      tenantId: context.tenantId,
      access,
    })
    return successResponse({
      ...result,
      ...(mobile ? { entity: safeMobileEntity(result.entity) } : {}),
    })
  } catch (error) {
    return errorResponse(error, mobile)
  }
}
