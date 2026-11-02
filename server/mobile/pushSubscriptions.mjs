const uuid = value => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value)
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
export function validateMobilePushSubscription(body) {
  const fields = ['installationId', 'revision', 'deliveryId', 'provider', 'pushToken', 'applicationId', 'showDetails']
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))) fail(400, 'Некорректные параметры подписки')
  if (!uuid(body.installationId) || !uuid(body.deliveryId) || !Number.isSafeInteger(body.revision) || body.revision < 1 ||
    !['expo', 'rustore'].includes(body.provider) || !['ru.escalion.vedelo', 'ru.escalion.vedelo.dev'].includes(body.applicationId) ||
    typeof body.showDetails !== 'boolean' || typeof body.pushToken !== 'string' || body.pushToken.length > 4096 ||
    (body.provider === 'expo' ? !/^(Exponent|Expo)PushToken\[[\w-]+\]$/.test(body.pushToken) : !/^[\w:.-]{20,4096}$/.test(body.pushToken))) fail(400, 'Некорректные параметры подписки')
  return { ...body }
}
export async function registerMobilePushSubscription({ model, sessions, tenantId, userId, sessionId, body }) {
  if (!tenantId || !userId || !sessionId) fail(401, 'Войдите заново для подключения уведомлений')
  const input = validateMobilePushSubscription(body)
  await model.init()
  const session = await sessions.findOne({ _id: sessionId, tenantId, userId, revokedAt: null, expiresAt: { $gt: new Date() } }).lean()
  if (!session) fail(401, 'Сессия завершена')
  const scope = { tenantId, installationId: input.installationId }
  const previous = await model.findOne(scope).lean()
  if (previous && previous.revision >= input.revision) {
    if (previous.revision === input.revision && previous.isActive && String(previous.sessionId) === String(sessionId) &&
      Object.entries(input).every(([key, value]) => previous[key] === value)) return previous
    fail(409, 'Регистрация уведомлений устарела')
  }
  try {
    const saved = await model.findOneAndUpdate({ ...scope, ...(previous ? { revision: previous.revision } : { revision: { $exists: false } }) },
      { $set: { ...input, tenantId, userId, sessionId, deviceId: session.deviceId || '', isActive: true } },
      { upsert: !previous, returnDocument: 'after' }).lean()
    if (!saved) fail(409, 'Регистрация уведомлений устарела')
    return saved
  } catch (error) { if (error.code === 11000) fail(409, 'Регистрация уведомлений устарела'); throw error }
}
export async function activeMobilePushSubscriptions({ model, sessions, tenantId }) {
  const records = await model.find({ tenantId, isActive: true }).lean()
  if (!records.length) return []
  const active = await sessions.find({ tenantId, _id: { $in: records.map(row => row.sessionId) }, revokedAt: null, expiresAt: { $gt: new Date() } }).select('_id userId').lean()
  return records.filter(row => active.some(session => String(session._id) === String(row.sessionId) && String(session.userId) === String(row.userId)))
}
