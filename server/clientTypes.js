import { DEFAULT_CLIENT_TYPES, resolveClientTypes, validateClientTypes } from '../helpers/clientTypes.mjs'

// Dependencies are injected so tenant boundaries and concurrent writes can be tested.
export const createClientTypesHandlers = ({ getContext, connect, Settings }) => {
  const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  const failure = (message, status) => reply({ success: false, error: {
    message, code: status === 409 ? 'CLIENT_TYPES_CONFLICT' : 'CLIENT_TYPES_ERROR',
  } }, status)
  const GET = async (req) => {
    const { tenantId } = await getContext(req)
    if (!tenantId) return failure('Не авторизован', 401)
    await connect()
    const settings = await Settings.findOne({ tenantId }).lean()
    return reply({ success: true, data: {
      items: settings ? resolveClientTypes(settings) : DEFAULT_CLIENT_TYPES,
      version: settings?.clientTypesVersion || 0,
      settingsId: settings?._id ? String(settings._id) : null,
    } })
  }
  const PUT = async (req) => {
    const { tenantId } = await getContext(req)
    if (!tenantId) return failure('Не авторизован', 401)
    const body = await req.json().catch(() => null)
    if (!body || !Number.isSafeInteger(body.version) || body.version < 0)
      return failure('Некорректная версия справочника', 400)
    await connect()
    const existing = await Settings.findOne({ tenantId }).lean()
    if ((existing?.clientTypesVersion || 0) !== body.version)
      return failure('Список изменён на другом устройстве. Обновите его и повторите изменение', 409)
    let items
    try {
      items = validateClientTypes(body.items, existing ? resolveClientTypes(existing) : DEFAULT_CLIENT_TYPES)
    } catch (error) { return failure(error.message, 400) }
    const filter = { tenantId, ...(body.version === 0
      ? { $or: [{ clientTypesVersion: 0 }, { clientTypesVersion: { $exists: false } }] }
      : { clientTypesVersion: body.version }) }
    try {
      const saved = await Settings.findOneAndUpdate(filter, {
        $set: { tenantId, clientTypes: items },
        $inc: { clientTypesVersion: 1, syncVersion: 1 },
      }, { upsert: !existing, returnDocument: 'after', runValidators: true }).lean()
      if (!saved) return failure('Список изменён на другом устройстве. Обновите его', 409)
      return reply({ success: true, data: { items: saved.clientTypes, version: saved.clientTypesVersion, settingsId: String(saved._id) } })
    } catch (error) {
      if (error?.code === 11000) return failure('Список изменён на другом устройстве. Обновите его', 409)
      return failure('Не удалось сохранить типы клиентов', 500)
    }
  }
  return { GET, PUT }
}
