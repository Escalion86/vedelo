import { createHash, randomUUID } from 'node:crypto'
import GoogleImportOperations from '@models/GoogleImportOperations'

const identity = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
const leaseMs = 120_000
const lost = () => Object.assign(new Error('Другой запрос продолжает импорт. Обновите список и повторите позже.'), { code: 'GOOGLE_IMPORT_BUSY' })

// One item at a time per tenant, including simultaneous PWA/APK requests.
// Refreshing the clients inside this lease prevents two items with the same
// phone creating separate clients. Entity IDs also survive a lost write reply.
export const withGoogleImportOperation = async ({ tenantId, calendarId, sourceId }, work) => {
  const lockId = identity('google-import-lock', String(tenantId))
  const id = identity('google-import-item', String(tenantId), calendarId, sourceId)
  const scope = { _id: id, tenantId }
  const token = randomUUID()
  try {
    await GoogleImportOperations.updateOne({ _id: lockId, tenantId }, { $setOnInsert: { kind: 'lock' } }, { upsert: true })
  } catch (error) { if (error.code !== 11000) throw error }
  const lease = await GoogleImportOperations.findOneAndUpdate(
    { _id: lockId, tenantId, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: new Date() } }] },
    { $set: { leaseToken: token, leaseUntil: new Date(Date.now() + leaseMs) } },
    { returnDocument: 'after' }
  ).lean()
  if (!lease) throw lost()
  const leaseFilter = { _id: lockId, tenantId, leaseToken: token, leaseUntil: { $gt: new Date() } }
  const assertCurrent = async () => {
    const result = await GoogleImportOperations.updateOne(
      { ...leaseFilter, leaseUntil: { $gt: new Date() } },
      { $set: { leaseUntil: new Date(Date.now() + leaseMs) } }
    )
    if (!result.matchedCount) throw lost()
  }
  try {
    const row = await GoogleImportOperations.findOneAndUpdate(scope,
      { $setOnInsert: { kind: 'item', calendarId, sourceId } },
      { upsert: true, returnDocument: 'after' }).lean()
    const save = async update => { await assertCurrent(); await GoogleImportOperations.updateOne(scope, { $set: update }) }
    return await work({
      id, row, assertCurrent, save,
      eventId: identity('google-import-event', id),
      clientId: identity('google-import-client', id),
      analysisOperationId: `google:${id}:${row.analysisAttempt || 0}`,
    })
  } finally {
    await GoogleImportOperations.updateOne({ _id: lockId, tenantId, leaseToken: token }, { $unset: { leaseUntil: 1, leaseToken: 1 } })
  }
}
