import { createHash } from 'node:crypto'

const fail = (status, message) => Object.assign(new Error(message), { status })
const objectId = value => /^[a-f\d]{24}$/i.test(String(value || ''))
const digest = value => createHash('sha256').update(value).digest('hex')
export const parseAndroidCallResult = body => {
  const allowed = new Set(['requestId', 'phone', 'direction', 'result', 'note', 'clientId', 'eventId', 'nextContactAt', 'nextContactTitle'])
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !allowed.has(key))) throw fail(400, 'Некорректные поля результата')
  if (typeof body.requestId !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(body.requestId)) throw fail(400, 'Нужен идентификатор попытки')
  if (typeof body.phone !== 'string' || body.phone.length > 40) throw fail(400, 'Укажите телефон')
  let phone = body.phone.replace(/\D/g, '')
  if (phone.length === 10) phone = `7${phone}`
  if (phone.length === 11 && phone.startsWith('8')) phone = `7${phone.slice(1)}`
  if (!/^\d{7,15}$/.test(phone)) throw fail(400, 'Укажите корректный телефон')
  if (!['incoming', 'outgoing', 'unknown'].includes(body.direction)) throw fail(400, 'Укажите направление звонка')
  if (!['answered', 'no_answer', 'callback', 'follow_up'].includes(body.result)) throw fail(400, 'Выберите результат звонка')
  const note = body.note ?? '', title = body.nextContactTitle ?? 'Следующий контакт'
  if (typeof note !== 'string' || note.length > 1000 || typeof title !== 'string' || title.length > 200) throw fail(400, 'Слишком длинная заметка или задача')
  for (const field of ['clientId', 'eventId']) if (body[field] && !objectId(body[field])) throw fail(400, 'Некорректная связанная запись')
  const date = body.nextContactAt ? new Date(body.nextContactAt) : null
  if (date && (!Number.isFinite(date.getTime()) || !body.eventId)) throw fail(400, 'Для следующего контакта нужны дата и связанная работа')
  return { requestId: body.requestId.toLowerCase(), phone, direction: body.direction, result: body.result,
    note: note.trim(), clientId: body.clientId || null, eventId: body.eventId || null,
    nextContactAt: date?.toISOString() || null, nextContactTitle: date ? title.trim() || 'Следующий контакт' : '' }
}

/** Explicit user result only. Every persisted step can be repeated after a lost response. */
export async function saveAndroidCallResult({ Calls, Events, Clients, tenantId, userId, body, now = new Date() }) {
  if (!objectId(tenantId) || !objectId(userId)) throw fail(401, 'Не авторизован')
  const input = parseAndroidCallResult(body)
  const fingerprint = digest(JSON.stringify(input))
  const id = digest(`android-call:${tenantId}:${input.requestId}`).slice(0, 24)
  const taskId = digest(`android-task:${tenantId}:${input.requestId}`).slice(0, 24)
  const scope = { _id: id, tenantId, provider: 'android', providerCallId: input.requestId }
  let call = await Calls.findOne(scope).lean()
  if (call && call.androidResultOperation?.fingerprint !== fingerprint) throw fail(409, 'Эта попытка уже содержит другой результат. Повторите исходные данные.')
  if (call?.androidResultOperation?.state === 'confirmed') return { call, event: null, replay: true }
  const rejectBeforeSave = (status, message) => { throw Object.assign(fail(status, message), { notSaved: !call }) }
  if (input.clientId && !await Clients.exists({ _id: input.clientId, tenantId })) rejectBeforeSave(404, 'Клиент не найден')
  let event = input.eventId ? await Events.findOne({ _id: input.eventId, tenantId }).lean() : null
  if (input.eventId && !event) rejectBeforeSave(404, 'Работа не найдена')
  const taskAlreadySaved = event?.additionalEvents?.some(task => String(task._id) === taskId)
  if (input.nextContactAt && !taskAlreadySaved && !['draft', 'active'].includes(event.status)) rejectBeforeSave(409, 'Следующий контакт можно добавить к заявке или активной работе')
  if (!call) {
    try {
      call = await Calls.create({ ...scope, phone: input.phone, normalizedPhone: input.phone,
        direction: input.direction, startedAt: null, endedAt: null, durationSec: null,
        status: input.eventId ? 'linked' : 'ready', linkedClientId: input.clientId, linkedEventId: input.eventId,
        callResult: input.result, callResultNote: input.note, callResultAt: now,
        androidResultOperation: { fingerprint, state: 'pending', createdBy: userId, taskId: input.nextContactAt ? taskId : null } })
    } catch (error) {
      if (error?.code !== 11000) throw error
      call = await Calls.findOne(scope).lean()
      if (!call || call.androidResultOperation?.fingerprint !== fingerprint) throw fail(409, 'Результат изменился. Повторите исходную попытку.')
    }
  }
  if (input.nextContactAt) {
    await Events.updateOne({ _id: input.eventId, tenantId, status: { $in: ['draft', 'active'] }, 'additionalEvents._id': { $ne: taskId } },
      { $push: { additionalEvents: { _id: taskId, title: input.nextContactTitle, description: input.note, date: new Date(input.nextContactAt), done: false, doneAt: null, googleCalendarEventId: '', googleSyncMode: 'event', googleDurationMinutes: 30 } }, $inc: { syncVersion: 1 } })
    event = await Events.findOne({ _id: input.eventId, tenantId }).lean()
    if (!event?.additionalEvents?.some(task => String(task._id) === taskId)) throw fail(409, 'Следующий контакт пока не подтверждён. Повторите ту же попытку.')
  }
  call = await Calls.findOneAndUpdate(scope, { $set: { 'androidResultOperation.state': 'confirmed' } }, { returnDocument: 'after' }).lean()
  if (!call) throw fail(409, 'Результат пока не подтверждён. Повторите попытку.')
  return { call, event, replay: false }
}

export const serializeAndroidCallResult = call => ({
  _id: String(call._id), requestId: call.providerCallId, source: 'android', phone: call.phone,
  direction: call.direction, result: call.callResult, note: call.callResultNote,
  savedAt: call.callResultAt, durationSec: null,
  clientId: call.linkedClientId ? String(call.linkedClientId) : null,
  eventId: call.linkedEventId ? String(call.linkedEventId) : null,
  pending: call.androidResultOperation?.state !== 'confirmed',
})
