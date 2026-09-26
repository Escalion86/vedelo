import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import Events from '@models/Events'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import dbConnect from '@server/dbConnect'
import { normalizeEntityDocument } from '@helpers/entityDocuments'
import { validateDocumentPaymentLinks } from '@server/documentPaymentLinks'

export const POST = async (req, { params }) => {
  const { tenantId, user } = await getTenantContext()
  const error = (message, status) =>
    NextResponse.json({ success: false, error: message }, { status })
  if (!tenantId || !user?._id) return error('Не авторизован', 401)
  const access = await getUserTariffAccess(user._id)
  if (!access?.allowDocuments)
    return error('Документы недоступны на текущем тарифе', 403)
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id)) return error('Некорректный ID', 400)
  await dbConnect()
  const event = await Events.findOne({ _id: id, tenantId }).lean()
  if (!event) return error('Заявка или заказ не найдены', 404)
  const body = await req.json().catch(() => ({}))
  let url
  try {
    url = new URL(body.url)
  } catch {
    return error('Некорректная ссылка', 400)
  }
  if (!['http:', 'https:'].includes(url.protocol))
    return error('Допустимы только ссылки HTTP/HTTPS', 400)
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(String(body.id || '')))
    return error('Некорректный ID документа', 400)
  const document = normalizeEntityDocument({
    ...body,
    url: url.toString(),
    file: null,
  })
  if (!(await validateDocumentPaymentLinks([document], tenantId, id)))
    return error('Оплата не найдена в этом заказе', 400)
  const updated = await Events.findOneAndUpdate(
    { _id: id, tenantId, 'documents.id': { $ne: document.id } },
    { $push: { documents: document }, $inc: { syncVersion: 1 } },
    { returnDocument: 'after', runValidators: true }
  ).lean()
  const entity = updated || (await Events.findOne({ _id: id, tenantId }).lean())
  return NextResponse.json({
    success: true,
    data: {
      entity,
      document: entity.documents.find((item) => item.id === document.id),
    },
  })
}

export const PATCH = async (req, { params }) => {
  const { tenantId, user } = await getTenantContext()
  const error = (message, status) =>
    NextResponse.json({ success: false, error: message }, { status })
  if (!tenantId || !user?._id) return error('Не авторизован', 401)
  const access = await getUserTariffAccess(user._id)
  if (!access?.allowDocuments)
    return error('Документы недоступны на текущем тарифе', 403)
  const { id } = await params
  if (!mongoose.Types.ObjectId.isValid(id)) return error('Некорректный ID', 400)
  const body = await req.json().catch(() => ({}))
  const documentId = String(body.documentId || '')
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(documentId))
    return error('Некорректный ID документа', 400)
  const hasTransactionId = Object.hasOwn(body, 'transactionId')
  const transactionId = String(body.transactionId || '')
  if (transactionId && !mongoose.Types.ObjectId.isValid(transactionId))
    return error('Некорректная оплата', 400)
  await dbConnect()
  const currentEntity = await Events.findOne({
    _id: id,
    tenantId,
    'documents.id': documentId,
  }).lean()
  const currentDocument = currentEntity?.documents?.find(
    (item) => item.id === documentId
  )
  if (!currentDocument) return error('Документ не найден', 404)
  const type = ['contract', 'invoice', 'receipt', 'act', 'other'].includes(
    String(body.type || '')
  )
    ? String(body.type)
    : currentDocument.type
  const nextTransactionId =
    type === 'receipt'
      ? hasTransactionId
        ? transactionId
        : String(currentDocument.transactionId || '')
      : ''
  if (
    !(await validateDocumentPaymentLinks(
      [{ transactionId: nextTransactionId }],
      tenantId,
      id
    ))
  )
    return error('Оплата не найдена в этом заказе', 400)
  let url = currentDocument.url || ''
  if (currentDocument.url && Object.hasOwn(body, 'url')) {
    try {
      url = new URL(String(body.url || '')).toString()
    } catch {
      return error('Некорректная ссылка', 400)
    }
    if (!['http:', 'https:'].includes(new URL(url).protocol))
      return error('Допустимы только ссылки HTTP/HTTPS', 400)
  }
  const title = Object.hasOwn(body, 'title')
    ? String(body.title || '').trim()
    : String(currentDocument.title || '').trim()
  if (!title) return error('Укажите название документа', 400)
  const customTypeName =
    type === 'other'
      ? Object.hasOwn(body, 'customTypeName')
        ? String(body.customTypeName || '').trim()
        : String(currentDocument.customTypeName || '').trim()
      : ''
  const entity = await Events.findOneAndUpdate(
    {
      _id: id,
      tenantId,
      'documents.id': documentId,
    },
    {
      $set: {
        'documents.$.type': type,
        'documents.$.customTypeName': customTypeName,
        'documents.$.title': title,
        'documents.$.url': url,
        'documents.$.transactionId': nextTransactionId,
      },
      $inc: { syncVersion: 1 },
    },
    { returnDocument: 'after' }
  ).lean()
  if (!entity) return error('Документ не найден', 404)
  return NextResponse.json({
    success: true,
    data: {
      entity,
      document: entity.documents.find((item) => item.id === documentId),
    },
  })
}
