// Восстановление справочника из мероприятий. По умолчанию — только подсчёт.
// Подключение: MONGODB_URI и MONGODB_DBNAME из окружения.
const { MongoClient, ObjectId } = require('mongoose').mongo

const parseArgs = (args) => {
  const options = { apply: false }
  for (const arg of args) {
    if (arg === '--apply') options.apply = true
    else if (arg === '--all') options.all = true
    else if (arg === '--developer') options.developer = true
    else if (/^--tenant=[a-f\d]{24}$/i.test(arg))
      options.tenantId = new ObjectId(arg.slice(9))
    else throw new Error('Неизвестный аргумент или некорректный --tenant.')
  }
  if ([options.all, options.developer, options.tenantId].filter(Boolean).length !== 1)
    throw new Error('Укажите ровно один режим: --tenant=<ID>, --developer или --all.')
  return options
}

const restoreEventTypes = async (db, options) => {
  const users = await db.collection('users').find(
    options.developer ? { role: 'dev' } : options.tenantId
      ? { $or: [{ tenantId: options.tenantId }, { _id: options.tenantId }] }
      : {},
    { projection: { _id: 1, tenantId: 1 } }
  ).toArray()
  const tenants = new Map()
  for (const user of users) {
    const tenantId = user.tenantId || user._id
    if (!(tenantId instanceof ObjectId))
      throw new Error('Некорректный tenantId. Изменения не начаты.')
    if (!options.tenantId || tenantId.equals(options.tenantId))
      tenants.set(String(tenantId), tenantId)
  }
  if (!tenants.size || (options.developer && tenants.size !== 1))
    throw new Error('Аккаунт не найден или разработчик неоднозначен. Используйте --tenant=<ID>.')

  const plans = []
  for (const tenantId of tenants.values()) {
    const settings = await db.collection('sitesettings').find(
      { tenantId }, { projection: { custom: 1 } }
    ).toArray()
    if (settings.length > 1)
      throw new Error('Дубли настроек организации. Изменения не начаты.')
    const current = settings[0]
    const custom = current?.custom
    if (custom !== undefined && (!custom || typeof custom !== 'object' || Array.isArray(custom)))
      throw new Error('Некорректный custom. Изменения не начаты.')
    const list = custom?.eventTypes
    if (list !== undefined && (!Array.isArray(list) || list.some(x => typeof x !== 'string')))
      throw new Error('Некорректный справочник. Изменения не начаты.')
    const used = await db.collection('events').distinct('eventType', {
      tenantId, isDemo: { $ne: true }, eventType: { $type: 'string' },
    })
    const existing = new Set((list || []).map(x => x.trim()))
    const additions = [...new Set(used.filter(x => typeof x === 'string').map(x => x.trim()))]
      .filter(x => x && !existing.has(x)).sort((a, b) => a.localeCompare(b, 'ru'))
    plans.push({ tenantId, current, list, additions })
  }
  const summary = {
    mode: options.apply ? 'apply' : 'dry-run',
    accountsChecked: plans.length,
    accountsToUpdate: plans.filter(x => x.additions.length).length,
    typesToAdd: plans.reduce((sum, x) => sum + x.additions.length, 0),
    accountsUpdated: 0,
    conflicts: 0,
  }
  if (!options.apply) return summary
  for (const { tenantId, current, list, additions } of plans) {
    if (!additions.length) continue
    const now = new Date()
    try {
      const result = await db.collection('sitesettings').updateOne(
        {
          tenantId,
          ...(current ? { _id: current._id } : {}),
          'custom.eventTypes': list === undefined ? { $exists: false } : { $eq: list },
        },
        {
          $addToSet: { 'custom.eventTypes': { $each: additions } },
          $set: { updatedAt: now },
          $setOnInsert: { tenantId, createdAt: now },
          $inc: { syncVersion: 1 },
        },
        { upsert: !current }
      )
      if (result.modifiedCount || result.upsertedCount) summary.accountsUpdated++
      else summary.conflicts++
    } catch (error) {
      if (error.code === 11000) summary.conflicts++
      else throw error
    }
  }
  return summary
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DBNAME)
    throw new Error('Задайте MONGODB_URI и MONGODB_DBNAME.')
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000, retryWrites: false,
  })
  try {
    await client.connect()
    const summary = await restoreEventTypes(client.db(process.env.MONGODB_DBNAME), options)
    console.log(JSON.stringify(summary, null, 2))
    if (summary.conflicts) process.exitCode = 2
  } finally {
    await client.close()
  }
}

module.exports = { parseArgs, restoreEventTypes }
if (require.main === module) main().catch(() => {
  // Не выводим исключение драйвера: оно может содержать адрес подключения или данные.
  console.error('Восстановление не завершено. Проверьте подключение, режим выбора аккаунта и структуру настроек. Повторный запуск безопасен.')
  process.exitCode = 1
})
