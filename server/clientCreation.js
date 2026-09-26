import { createHash } from 'node:crypto'

const hash = (value) => createHash('sha256').update(value).digest('hex')

// Детерминированный _id использует уникальный индекс MongoDB: два процесса
// не могут создать двух клиентов для одной операции, даже при потере ответа.
export const createClientOnce = async ({
  Clients, tenantId, body, documents, key,
}) => {
  const {
    _id: ignoredId,
    webCreateFingerprint: ignoredFingerprint,
    ...fields
  } = body
  if (key && !/^[a-zA-Z0-9_-]{8,128}$/.test(key)) {
    return { status: 400, error: 'Некорректный ключ операции' }
  }
  const fingerprint = key ? hash(JSON.stringify(body)) : undefined
  const id = key
    ? hash(`vedelo:client:${tenantId}:${key}`).slice(0, 24)
    : undefined
  const serialize = (client) => {
    const data = client.toJSON()
    delete data.webCreateFingerprint
    return data
  }
  try {
    const client = await Clients.create({
      ...fields,
      documents,
      tenantId,
      ...(key ? { _id: id, webCreateFingerprint: fingerprint } : {}),
    })
    return { data: serialize(client), created: true }
  } catch (error) {
    if (!key || error?.code !== 11000) throw error
    const existing = await Clients.findOne({ _id: id, tenantId })
      .select('+webCreateFingerprint')
    if (!existing) throw error
    if (existing.webCreateFingerprint !== fingerprint) {
      return {
        status: 409,
        error: 'Ключ операции уже использован для других данных',
      }
    }
    return { data: serialize(existing), created: false }
  }
}
