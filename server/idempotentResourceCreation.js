import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'

const failure = (message, status, code) => Object.assign(new Error(message), { creationFailure: true, status, code })
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
export const isCreationRequestId = value => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value)
const visible = document => {
  const item = document.toObject?.() || { ...document }
  delete item.creationRequest
  delete item.creationDeletedAt
  return item
}

// The immutable Mongo _id is the reservation, so concurrent writes cannot
// create two resources. There is no expiring receipt or lease to outlive.
export const prepareResourceCreation = async ({ model, kind, context, scope = {}, body }) => {
  if (body?.requestId === undefined) return { existing: null, create: draft => model.create(draft) }
  if (!isCreationRequestId(body.requestId)) throw failure('Некорректный идентификатор создания', 400, 'invalid_creation_request')
  const requestId = body.requestId.toLowerCase(), tenantId = context.tenantId, userId = String(context.user._id)
  const id = hash(['vedelo-create-v1', kind, String(tenantId), userId, requestId]).slice(0, 24)
  const { requestId: _ignored, ...input } = body
  const fingerprint = hash({ scope, input })
  const read = () => model.findOne({ _id: id, tenantId }).setOptions({ includeCreationTombstones: true }).select('+creationRequest +creationDeletedAt').lean()
  const verify = item => {
    if (!item || item.creationRequest?.userId !== userId || item.creationRequest?.fingerprint !== fingerprint)
      throw failure('Эта попытка создания относится к другим данным', 409, 'creation_request_changed')
    if (item.creationDeletedAt) throw failure(
      item.creationRequest.cancelled ? 'Попытка создания отменена' : 'Созданная запись уже удалена. Повтор не восстановит её',
      410, item.creationRequest.cancelled ? 'creation_cancelled' : 'created_resource_deleted'
    )
    return visible(item)
  }
  const previous = await read()
  return {
    existing: previous ? verify(previous) : null,
    cancel: async () => {
      // Reserve the immutable ID before acknowledging cancellation. If a creator
      // already won, return its identity without deleting the saved resource.
      try {
        await model.collection.insertOne({
          _id: model.schema.path('_id').cast(id),
          tenantId: model.schema.path('tenantId').cast(tenantId),
          creationRequest: { requestId, userId, fingerprint, cancelled: true },
          creationDeletedAt: new Date(),
        })
        return { state: 'cancelled' }
      } catch (error) {
        if (error.code !== 11000) throw error
        const item = verify(await read())
        return { state: 'created', id: String(item._id) }
      }
    },
    create: async draft => {
      try {
        return visible(await model.create({ ...draft, _id: id, tenantId, creationRequest: { requestId, userId, fingerprint } }))
      } catch (error) {
        if (error.code !== 11000) throw error
        return verify(await read())
      }
    },
  }
}

export const deleteCreatedResource = async (model, filter) => {
  const item = await model.findOne(filter).select('+creationRequest').lean()
  if (!item) return null
  if (!item.creationRequest) return model.findOneAndDelete(filter)
  // Remove content, contacts, public tokens and media references. Only technical
  // identity/hash remain; account deletion can still physically remove the row.
  const tombstone = { _id: item._id, tenantId: item.tenantId, creationRequest: item.creationRequest, creationDeletedAt: new Date() }
  const result = await model.collection.replaceOne({ ...filter, _id: item._id, tenantId: item.tenantId, creationDeletedAt: { $exists: false } }, tombstone)
  return result.matchedCount ? { _id: item._id } : null
}

export const withCreationErrors = handler => async (...args) => {
  try { return await handler(...args) } catch (error) {
    if (!error.creationFailure) throw error
    return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status })
  }
}

// New mobile URLs fail closed on old backends that ignore requestId. The common
// PWA operation remains responsible for tenant, tariff and object ownership.
export const requireCreationRequest = handler => async (req, ...args) => {
  let body
  try { body = await req.json() } catch { body = null }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !isCreationRequestId(body.requestId))
    return NextResponse.json({ success: false, error: { code: 'invalid_creation_request', message: 'Некорректная попытка создания' } }, { status: 400 })
  const headers = new Headers(req.headers)
  headers.delete('content-length'); headers.set('content-type', 'application/json')
  return handler(new Request(req.url, { method: 'POST', headers, body: JSON.stringify(body) }), ...args)
}
