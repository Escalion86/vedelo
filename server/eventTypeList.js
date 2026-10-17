import { randomUUID } from 'node:crypto'
import { normalizeEventTypeList, prepareEventTypeEdit } from '../helpers/eventTypeList.mjs'
import { countTypeUsage } from './typeUsage.js'

export const createEventTypeListHandlers = ({ Settings, Events, getContext, connect }) => {
  const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  const fail = (message, status) => reply({ error: message }, status)
  const read = async tenantId => {
    const settings = await Settings.findOne({ tenantId }).lean()
    return {
      items: normalizeEventTypeList(settings?.custom?.eventTypes),
      usage: await countTypeUsage(Events, tenantId, 'eventType'),
      pending: settings?.eventTypesEdit || null,
    }
  }
  const GET = async req => {
    const { tenantId } = await getContext(req)
    if (!tenantId) return fail('Не авторизован', 401)
    await connect()
    return reply(await read(tenantId))
  }
  const PUT = async req => {
    const { tenantId } = await getContext(req)
    if (!tenantId) return fail('Не авторизован', 401)
    const body = await req.json().catch(() => null)
    let plan
    try { plan = prepareEventTypeEdit(body?.base, body?.rows) }
    catch (error) { return fail(error.message, 400) }
    await connect()
    let settings = await Settings.findOne({ tenantId }).lean()
    if (!settings) {
      try {
        settings = await Settings.findOneAndUpdate({ tenantId }, { $setOnInsert: { tenantId } }, { upsert: true, returnDocument: 'after' }).lean()
      } catch (error) { if (error.code !== 11000) throw error; settings = await Settings.findOne({ tenantId }).lean() }
    }
    let operation = settings.eventTypesEdit
    if (operation) {
      if (JSON.stringify(operation.plan) !== JSON.stringify(plan)) return fail('Сначала завершите предыдущее изменение списка', 409)
    } else {
      const current = normalizeEventTypeList(settings.custom?.eventTypes)
      if (JSON.stringify(current) !== JSON.stringify(plan.base)) {
        if (JSON.stringify(current) === JSON.stringify(plan.next)) return reply(await read(tenantId))
        return fail('Список изменён на другом устройстве. Откройте его заново', 409)
      }
      operation = { id: randomUUID(), plan }
      const reserved = await Settings.findOneAndUpdate({
        tenantId, eventTypesEdit: null,
        'custom.eventTypes': settings.custom?.eventTypes ?? { $exists: false },
      }, { $set: { eventTypesEdit: operation } }, { returnDocument: 'after' }).lean()
      if (!reserved) return fail('Список уже изменяется. Повторите загрузку', 409)
    }
    try {
      if (plan.renames.length) {
        // Each document changes atomically; retry never matches an already renamed value.
        await Events.updateMany({ tenantId, eventType: { $in: plan.renames.map(x => x.from) } }, [{ $set: {
          eventType: { $switch: { branches: plan.renames.map(x => ({ case: { $eq: ['$eventType', { $literal: x.from }] }, then: { $literal: x.to } })), default: '$eventType' } },
          syncVersion: { $add: [{ $ifNull: ['$syncVersion', 0] }, 1] }, updatedAt: new Date(),
        } }], { updatePipeline: true })
      }
      const saved = await Settings.findOneAndUpdate({ tenantId, 'eventTypesEdit.id': operation.id }, {
        $set: { 'custom.eventTypes': plan.next }, $unset: { eventTypesEdit: '' }, $inc: { syncVersion: 1 },
      }, { returnDocument: 'after' }).lean()
      if (!saved) return fail('Список изменился. Повторите загрузку', 409)
      return reply(await read(tenantId))
    } catch {
      return fail('Не удалось завершить изменение. Повторите сохранение: уже обновлённые карточки сохранятся', 503)
    }
  }
  return { GET, PUT }
}
