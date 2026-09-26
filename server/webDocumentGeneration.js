import crypto from 'crypto'
import mongoose from 'mongoose'
import Events from '@models/Events'
import Clients from '@models/Clients'
import Services from '@models/Services'
import SiteSettings from '@models/SiteSettings'
import DocumentGenerations from '@models/DocumentGenerations'
import { normalizeDocumentTemplatesFromSettings } from '@helpers/documentTemplates'
import { getDocumentLastNumberKey } from '@helpers/documentTypes'
import { getContractTemplateVariablesMap } from '@helpers/generateContractTemplate'
import { getActTemplateVariablesMap } from '@helpers/generateActTemplate'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  DOCX_MIME,
  formatDocumentDate,
  renderDocxTemplate,
} from '@server/documentGeneration'
import {
  EntityDocumentError,
  normalizeEntityUploadId,
  uploadEntityDocument,
  sanitizeEntityFileName,
} from '@server/entityDocumentFiles'

const fail = (code, message, status = 400) => {
  throw new EntityDocumentError(code, message, status)
}

const inspect = (template, variables) => {
  const inspection = { fields: {}, unknown: new Set(), missing: new Set() }
  try {
    renderDocxTemplate({
      templateBase64: template.templateBase64,
      variables,
      inspection,
    })
  } catch {
    fail(
      'TEMPLATE_INVALID',
      'Не удалось прочитать DOCX. Проверьте структуру и скобки переменных.',
      422
    )
  }
  return {
    fields: Object.entries(inspection.fields).map(([name, value]) => ({
      name,
      value: /^\[\[(PARTIES_TABLES|SIGNATURES_TABLE):/.test(String(value))
        ? 'Таблица реквизитов / подписей сторон'
        : String(value ?? ''),
    })),
    unknown: [...inspection.unknown],
    missing: [...inspection.missing],
  }
}

export const generateWebDocument = async ({
  eventId,
  tenantId,
  user,
  access,
  body,
}) => {
  if (!access?.allowDocuments)
    fail('DOCUMENTS_UNAVAILABLE', 'Документы недоступны на текущем тарифе', 403)
  if (!mongoose.Types.ObjectId.isValid(eventId))
    fail('BAD_ID', 'Некорректный ID заказа')
  const event = await Events.findOne({ _id: eventId, tenantId }).lean()
  if (!event) fail('NOT_FOUND', 'Заявка или заказ не найдены', 404)
  const date = formatDocumentDate(body.documentDate)
  if (!date) fail('DATE_INVALID', 'Некорректная дата документа')
  const preview = body.action === 'preview'
  const requestId = preview ? '' : normalizeEntityUploadId(body.requestId)
  if (!preview) await DocumentGenerations.init()
  const filter = { tenantId, eventId, requestId }
  const fingerprint = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        templateId: String(body.templateId || ''),
        date: date.iso,
        source: body.source === 'proposal' ? 'proposal' : 'event',
      })
    )
    .digest('hex')
  let operation = preview
    ? null
    : await DocumentGenerations.findOne(filter).lean()
  if (operation && operation.fingerprint !== fingerprint)
    fail(
      'REQUEST_CONFLICT',
      'Параметры повторного запроса изменились. Создайте новый документ.',
      409
    )
  const existing =
    requestId && event.documents?.find((item) => item.id === requestId)
  if (operation && existing) return { document: existing, entity: event }
  if (existing)
    fail(
      'REQUEST_CONFLICT',
      'Этот идентификатор уже занят другим документом',
      409
    )
  if (!operation) {
    const settings = await SiteSettings.findOne({ tenantId }).lean()
    const template = normalizeDocumentTemplatesFromSettings(
      settings?.custom
    ).find((item) => item.id === body.templateId)
    if (!template) fail('TEMPLATE_NOT_FOUND', 'Выберите доступный шаблон', 404)
    if (template.type === 'receipt')
      fail(
        'RECEIPT_UPLOAD_REQUIRED',
        'Прикрепите готовый чек файлом или ссылкой. DOCX-шаблон не выдаёт чек.'
      )
    const [client, services] = await Promise.all([
      event.clientId
        ? Clients.findOne({ _id: event.clientId, tenantId }).lean()
        : null,
      Services.find({ _id: { $in: event.servicesIds || [] }, tenantId }).lean(),
    ])
    const custom = settings?.custom || {}
    const meta = {
      defaultTown: settings?.defaultTown || '',
      documentNumber: 'Будет присвоен при создании',
      contractDate: date.iso,
      actDate: date.iso,
      requisitesSidesMode: 'docx',
    }
    for (const key of [
      'FullName',
      'Name',
      'Status',
      'Ogrnip',
      'Inn',
      'BankName',
      'Bik',
      'CheckingAccount',
      'CorrespondentAccount',
      'LegalAddress',
    ]) {
      meta[`artist${key}`] = custom[`contractArtist${key}`] || ''
    }
    meta.artistStatus ||= 'individual_entrepreneur'
    const source = body.source === 'proposal' ? event.agreedProposal : null
    if (body.source === 'proposal' && !source)
      fail('PROPOSAL_NOT_APPLIED', 'Сначала примените выбранный вариант КП')
    const sourceEvent = source ? { ...event, contractSum: source.total } : event
    const serviceTitles = source
      ? source.lines.map((line) => `${line.title} — ${line.price} ₽`)
      : (event.servicesIds || [])
          .map(
            (id) =>
              services.find((item) => String(item._id) === String(id))?.title
          )
          .filter(Boolean)
    const buildVariables =
      template.type === 'act'
        ? getActTemplateVariablesMap
        : getContractTemplateVariablesMap
    const variables = buildVariables({
      event: sourceEvent,
      client,
      serviceTitles,
      performerName: getPersonFullName(user),
      siteSettings: settings || {},
      contractMeta: meta,
      actMeta: meta,
    })
    // A contract is optional: do not invent its date for an independent act/invoice.
    if (template.type !== 'contract') variables['ДАТА ДОГОВОРА'] = ''
    variables['ДАТА ДОКУМЕНТА'] = date.label
    variables['СУММА ДОКУМЕНТА'] = String(sourceEvent.contractSum || 0)
    const validation = inspect(template, variables)
    if (preview)
      return {
        preview: validation,
        source: source ? 'Согласованное КП' : 'Сохранённые данные заказа',
      }
    if (validation.unknown.length)
      fail(
        'UNKNOWN_VARIABLES',
        `Неизвестные переменные: ${validation.unknown.join(', ')}`,
        422
      )
    if (validation.missing.length && body.allowEmpty !== true)
      fail(
        'MISSING_VALUES',
        `Не заполнены данные: ${validation.missing.join(', ')}`,
        422
      )
    const numbered = await SiteSettings.findOneAndUpdate(
      { tenantId },
      {
        $inc: {
          [`custom.${getDocumentLastNumberKey(template.type)}`]: 1,
          syncVersion: 1,
        },
      },
      { returnDocument: 'after' }
    ).lean()
    const number = Number(
      numbered.custom[getDocumentLastNumberKey(template.type)]
    )
    variables['НОМЕР ДОКУМЕНТА'] = String(number)
    try {
      operation = (
        await DocumentGenerations.create({
          ...filter,
          fingerprint,
          number,
          template,
          variables,
          documentDate: date.iso,
          state: 'ready',
        })
      ).toObject()
    } catch (error) {
      if (error.code !== 11000) throw error
      operation = await DocumentGenerations.findOne(filter).lean()
      if (operation?.fingerprint !== fingerprint)
        fail('REQUEST_CONFLICT', 'Параметры запроса изменились', 409)
    }
  }
  if (operation.state === 'complete') {
    const current = await Events.findOne({ _id: eventId, tenantId }).lean()
    const document = current?.documents?.find((item) => item.id === requestId)
    if (document) return { document, entity: current }
    fail('DOCUMENT_REMOVED', 'Документ был удалён. Создайте новый документ.', 410)
  }
  const content = renderDocxTemplate({
    templateBase64: operation.template.templateBase64,
    variables: operation.variables,
  })
  const fileName = sanitizeEntityFileName(
    `${operation.template.name} №${operation.number} от ${formatDocumentDate(operation.documentDate).label}.docx`
  )
  const formData = new FormData()
  formData.set('file', new File([content], fileName, { type: DOCX_MIME }))
  formData.set('uploadId', requestId)
  formData.set('type', operation.template.type)
  formData.set('customTypeName', operation.template.customTypeName || '')
  formData.set('title', `${operation.template.name} №${operation.number}`)
  formData.set('number', String(operation.number))
  formData.set('documentDate', operation.documentDate)
  formData.set('templateId', operation.template.id)
  const result = await uploadEntityDocument({
    formData,
    entityType: 'events',
    entityId: eventId,
    tenantId,
    access,
  })
  await DocumentGenerations.updateOne(filter, {
    $set: { state: 'complete' },
    $unset: { 'template.templateBase64': '' },
  })
  return result
}
