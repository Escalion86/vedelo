import crypto from 'crypto'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import {
  normalizeDocumentTemplatesFromSettings,
  validateDocxTemplateFileMeta,
} from '@helpers/documentTemplates'
import { normalizeDocumentType } from '@helpers/documentTypes'

export const runtime = 'nodejs'

const toMetadata = (template) => ({
  id: template.id,
  name: template.name,
  type: template.type,
  customTypeName: template.customTypeName,
  fileName: template.fileName,
  ...(template.baseTemplateId ? { baseTemplateId: template.baseTemplateId } : {}),
  size: Math.floor((template.templateBase64.length * 3) / 4),
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
})

const getAccess = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId) {
    return { response: mobileError('UNAUTHORIZED', 'Не авторизован', 401) }
  }
  const access = await getUserTariffAccess(context.user._id)
  if (!access?.allowDocuments) {
    return {
      response: mobileError(
        'DOCUMENTS_NOT_AVAILABLE',
        'Документы недоступны на текущем тарифе',
        403
      ),
    }
  }
  return { context }
}

export const GET = async (req) => {
  const accessResult = await getAccess(req)
  if (accessResult.response) return accessResult.response
  await dbConnect()
  const settings = await SiteSettings.findOne({
    tenantId: accessResult.context.tenantId,
  }).lean()
  const templates = normalizeDocumentTemplatesFromSettings(settings?.custom)
  return mobileSuccess(templates.map(toMetadata))
}

export const POST = async (req) => {
  const accessResult = await getAccess(req)
  if (accessResult.response) return accessResult.response
  const form = await req.formData().catch(() => null)
  if (!form) return mobileError('FORM_INVALID', 'Некорректная форма', 400)

  const id = String(form.get('id') || '').trim()
  const name = String(form.get('name') || '').trim().slice(0, 160)
  const type = normalizeDocumentType(form.get('type'))
  const customTypeName =
    type === 'other'
      ? String(form.get('customTypeName') || '').trim().slice(0, 120)
      : ''
  const fileValue = form.get('file')
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null
  if (!name) {
    return mobileError('NAME_REQUIRED', 'Введите название шаблона', 400, 'name')
  }
  if (file) {
    const validation = validateDocxTemplateFileMeta(file)
    if (!validation.valid) {
      return mobileError('FILE_INVALID', validation.error, 400, 'file')
    }
  }

  await dbConnect()
  const settings = await SiteSettings.findOne({
    tenantId: accessResult.context.tenantId,
  }).lean()
  const templates = normalizeDocumentTemplatesFromSettings(settings?.custom)
  const existingIndex = id
    ? templates.findIndex((template) => template.id === id)
    : -1
  if (id && existingIndex < 0) {
    return mobileError('TEMPLATE_NOT_FOUND', 'Шаблон не найден', 404)
  }
  if (existingIndex < 0 && !file) {
    return mobileError('FILE_REQUIRED', 'Выберите DOCX-файл', 400, 'file')
  }

  const now = new Date().toISOString()
  const previous = existingIndex >= 0 ? templates[existingIndex] : null
  const nextTemplate = {
    id: previous?.id || crypto.randomUUID(),
    name,
    type,
    customTypeName,
    fileName: file?.name || previous?.fileName || 'template.docx',
    templateBase64: file
      ? Buffer.from(await file.arrayBuffer()).toString('base64')
      : previous.templateBase64,
    ...(type === 'contract' && previous?.baseTemplateId
      ? { baseTemplateId: previous.baseTemplateId }
      : {}),
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  }
  const nextTemplates = [...templates]
  if (existingIndex >= 0) nextTemplates[existingIndex] = nextTemplate
  else nextTemplates.push(nextTemplate)

  await SiteSettings.findOneAndUpdate(
    { tenantId: accessResult.context.tenantId },
    {
      $set: {
        tenantId: accessResult.context.tenantId,
        'custom.documentTemplates': nextTemplates,
      },
      $inc: { syncVersion: 1 },
    },
    { upsert: true, runValidators: true }
  )
  return mobileSuccess(toMetadata(nextTemplate), existingIndex >= 0 ? 200 : 201)
}

export const DELETE = async (req) => {
  const accessResult = await getAccess(req)
  if (accessResult.response) return accessResult.response
  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || '').trim()
  if (!id) return mobileError('ID_REQUIRED', 'Не указан шаблон', 400, 'id')

  await dbConnect()
  const settings = await SiteSettings.findOne({
    tenantId: accessResult.context.tenantId,
  }).lean()
  const templates = normalizeDocumentTemplatesFromSettings(settings?.custom)
  const nextTemplates = templates.filter((template) => template.id !== id)
  if (nextTemplates.length === templates.length) {
    return mobileError('TEMPLATE_NOT_FOUND', 'Шаблон не найден', 404)
  }
  await SiteSettings.updateOne(
    { tenantId: accessResult.context.tenantId },
    {
      $set: { 'custom.documentTemplates': nextTemplates },
      $inc: { syncVersion: 1 },
    }
  )
  return mobileSuccess({ id })
}
