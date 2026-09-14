import crypto from 'crypto'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Services from '@models/Services'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import createHistorySafely from '@server/historyAudit'
import {
  DOCX_MIME,
  formatDocumentDate,
  renderDocxTemplate,
} from '@server/documentGeneration'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import { uploadPrivateFileToEscalionCloud } from '@server/escalionCloud'
import { buildEntityDocumentStorageKey } from '@server/entityDocumentFiles'
import { normalizeDocumentTemplatesFromSettings } from '@helpers/documentTemplates'
import { getDocumentLastNumberKey } from '@helpers/documentTypes'
import { normalizeEventDocuments } from '@helpers/eventDocuments'
import { getContractTemplateVariablesMap } from '@helpers/generateContractTemplate'
import { getActTemplateVariablesMap } from '@helpers/generateActTemplate'
import getPersonFullName from '@helpers/getPersonFullName'

export const runtime = 'nodejs'

const getCustomValue = (custom, key) =>
  typeof custom?.get === 'function' ? custom.get(key) : custom?.[key]

export const POST = async (req, { params }) => {
  const { id } = await params
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId) {
    return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  }
  const access = await getUserTariffAccess(context.user._id)
  if (!access?.allowDocuments) {
    return mobileError(
      'DOCUMENTS_NOT_AVAILABLE',
      'Документы недоступны на текущем тарифе',
      403
    )
  }
  const body = await req.json().catch(() => ({}))
  const templateId = String(body?.templateId || '').trim()
  const documentDate = formatDocumentDate(body?.documentDate)
  if (!templateId) {
    return mobileError(
      'TEMPLATE_REQUIRED',
      'Выберите шаблон',
      400,
      'templateId'
    )
  }
  if (!documentDate) {
    return mobileError(
      'DATE_INVALID',
      'Некорректная дата документа',
      400,
      'documentDate'
    )
  }

  await dbConnect()
  const [event, settings] = await Promise.all([
    Events.findOne({ _id: id, tenantId: context.tenantId }).lean(),
    SiteSettings.findOne({ tenantId: context.tenantId }).lean(),
  ])
  if (!event)
    return mobileError('EVENT_NOT_FOUND', 'Мероприятие не найдено', 404)
  if (event.status === 'draft') {
    return mobileError(
      'DRAFT_DOCUMENTS_UNAVAILABLE',
      'Документы недоступны для заявки',
      409
    )
  }
  const template = normalizeDocumentTemplatesFromSettings(
    settings?.custom
  ).find((item) => item.id === templateId)
  if (!template)
    return mobileError('TEMPLATE_NOT_FOUND', 'Шаблон не найден', 404)

  const [client, services] = await Promise.all([
    event.clientId
      ? Clients.findOne({
          _id: event.clientId,
          tenantId: context.tenantId,
        }).lean()
      : null,
    event.servicesIds?.length
      ? Services.find({
          _id: { $in: event.servicesIds },
          tenantId: context.tenantId,
        }).lean()
      : [],
  ])
  const numberKey = getDocumentLastNumberKey(template.type)
  const numberedSettings = await SiteSettings.findOneAndUpdate(
    { tenantId: context.tenantId },
    {
      $setOnInsert: { tenantId: context.tenantId },
      $inc: { [`custom.${numberKey}`]: 1, syncVersion: 1 },
    },
    { upsert: true, returnDocument: 'after' }
  )
  const documentNumber =
    Number(getCustomValue(numberedSettings.custom, numberKey)) || 1
  const custom = numberedSettings.custom
  const meta = {
    defaultTown: numberedSettings.defaultTown || '',
    artistFullName: getCustomValue(custom, 'contractArtistFullName') || '',
    artistName: getCustomValue(custom, 'contractArtistName') || '',
    artistStatus:
      getCustomValue(custom, 'contractArtistStatus') ||
      'individual_entrepreneur',
    artistOgrnip: getCustomValue(custom, 'contractArtistOgrnip') || '',
    artistInn: getCustomValue(custom, 'contractArtistInn') || '',
    artistBankName: getCustomValue(custom, 'contractArtistBankName') || '',
    artistBik: getCustomValue(custom, 'contractArtistBik') || '',
    artistCheckingAccount:
      getCustomValue(custom, 'contractArtistCheckingAccount') || '',
    artistCorrespondentAccount:
      getCustomValue(custom, 'contractArtistCorrespondentAccount') || '',
    artistLegalAddress:
      getCustomValue(custom, 'contractArtistLegalAddress') || '',
    documentNumber: String(documentNumber),
    nextDocumentNumber: documentNumber,
    contractDate: documentDate.iso,
    actDate: documentDate.iso,
    requisitesSidesMode: 'docx',
  }
  const buildVariables =
    template.type === 'act'
      ? getActTemplateVariablesMap
      : getContractTemplateVariablesMap
  const variables = buildVariables({
    event,
    client,
    serviceTitles: services.map((service) => service.title).filter(Boolean),
    performerName: getPersonFullName(context.user),
    siteSettings: numberedSettings,
    ...(template.type === 'act' ? { actMeta: meta } : { contractMeta: meta }),
  })

  let content
  try {
    content = renderDocxTemplate({
      templateBase64: template.templateBase64,
      variables,
    })
  } catch {
    return mobileError(
      'DOCUMENT_GENERATION_FAILED',
      'Не удалось сформировать DOCX. Проверьте шаблон и его переменные.',
      422
    )
  }

  const fileName =
    `${template.name} №${documentNumber} от ${documentDate.label}.docx`
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 180)
  const documentId = crypto.randomUUID()
  const storageKey = buildEntityDocumentStorageKey({
    tenantId: context.tenantId,
    entityType: 'events',
    entityId: event._id,
    uploadId: documentId,
  })
  let uploaded
  try {
    uploaded = await uploadPrivateFileToEscalionCloud({
      file: new File([content], fileName, { type: DOCX_MIME }),
      storageKey,
      uploadId: documentId,
    })
  } catch {
    return mobileError(
      'DOCUMENT_UPLOAD_FAILED',
      'Документ сформирован, но не был загружен. Повторите попытку.',
      502
    )
  }
  const document = normalizeEventDocuments(
    [
      {
        id: documentId,
        type: template.type,
        customTypeName: template.customTypeName,
        title: template.name,
        file: {
          name: uploaded?.name || fileName,
          storageKey: uploaded?.storageKey || storageKey,
          size: uploaded?.size || content.length,
          contentType: uploaded?.contentType || DOCX_MIME,
          checksum: uploaded?.checksum || '',
        },
        createdAt: new Date().toISOString(),
      },
    ],
    { trustStorageKey: true }
  )[0]
  const updatedEvent = await Events.findOneAndUpdate(
    { _id: event._id, tenantId: context.tenantId },
    { $push: { documents: document }, $inc: { syncVersion: 1 } },
    { returnDocument: 'after' }
  )
  await createHistorySafely(
    {
      schema: Events.collection.collectionName,
      action: 'update',
      data: [
        {
          documents: {
            old: event.documents || [],
            new: updatedEvent.documents,
          },
        },
      ],
      userId: String(context.user._id),
      difference: true,
    },
    'mobile.events.documents.generate'
  )
  return mobileSuccess({ document, event: updatedEvent })
}
