import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import { getBuiltInContractTemplate } from '@server/builtInContractTemplates'
import { DOCX_MIME } from '@server/documentGeneration'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'

export const runtime = 'nodejs'

const errorResponse = (error, status) => NextResponse.json({ success: false, error }, { status })

const resolveTemplate = async (request, params) => {
  const { user, tenantId } = await getRequestContext(request)
  if (!user?._id || !tenantId)
    return { response: errorResponse('Не авторизован', 401) }

  const access = await getUserTariffAccess(user._id)
  if (!access?.allowDocuments)
    return { response: errorResponse('Документы недоступны на текущем тарифе', 403) }

  const { id } = await params
  const template = await getBuiltInContractTemplate(id)
  if (!template)
    return { response: errorResponse('Шаблон не найден', 404) }
  return { tenantId, template }
}

export const GET = async (request, { params }) => {
  const { template, response } = await resolveTemplate(request, params)
  if (response) return response

  return new Response(Buffer.from(template.contentBase64, 'base64'), {
    headers: {
      'Content-Type': DOCX_MIME,
      'Content-Disposition': `attachment; filename="${template.id}.docx"; filename*=UTF-8''${encodeURIComponent(`${template.name}.docx`)}`,
      'Cache-Control': 'no-store',
    },
  })
}

export const POST = async (request, { params }) => {
  const { tenantId, template, response } = await resolveTemplate(request, params)
  if (response) return response

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const id = typeof body?.requestId === 'string' ? body.requestId.toLowerCase() : ''
  if (!name || name.length > 160)
    return errorResponse('Введите название шаблона длиной до 160 знаков', 400)
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id))
    return errorResponse('Повторите сохранение шаблона из раздела «Документы»', 400)

  await dbConnect()
  const now = new Date().toISOString()
  const copy = {
    id,
    name,
    type: 'contract',
    customTypeName: '',
    baseTemplateId: template.id,
    fileName: `${template.id}.docx`,
    templateBase64: template.contentBase64,
    createdAt: now,
    updatedAt: now,
  }
  try {
    await SiteSettings.updateOne(
      { tenantId, 'custom.documentTemplates.id': { $ne: id } },
      {
        $setOnInsert: { tenantId },
        $push: { 'custom.documentTemplates': copy },
        $inc: { syncVersion: 1 },
      },
      { upsert: true }
    )
    return NextResponse.json({ success: true, data: copy }, { status: 201 })
  } catch (error) {
    if (error.code !== 11000) throw error
    const settings = await SiteSettings.findOne({ tenantId, 'custom.documentTemplates.id': id }).lean()
    const previous = settings?.custom?.documentTemplates?.find((item) => item.id === id)
    if (previous?.baseTemplateId !== template.id || previous?.name !== name)
      return errorResponse('Шаблон уже сохранён. Обновите список перед новой попыткой.', 409)
    return NextResponse.json({ success: true, data: previous })
  }
}
