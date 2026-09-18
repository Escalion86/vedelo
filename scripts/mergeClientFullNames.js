// Скрипт объединения ФИО клиентов в одну строку.
//
// Форма клиента в кабинете теперь использует одно поле «ФИО», которое
// сохраняется целиком в firstName (secondName/thirdName остаются пустыми).
// Этот скрипт приводит существующие записи к тому же виду:
//   firstName = "firstName secondName thirdName" (склейка непустых частей)
//   secondName = '', thirdName = ''
// Отображаемое имя при этом не меняется: все места в системе
// (getPersonFullName, уведомления, документы) и так склеивают эти поля.
// syncVersion увеличивается, чтобы изменения уехали в мобильную синхронизацию.
//
// По умолчанию работает в режиме dry-run: только показывает планируемые
// изменения, ничего не записывая. Для применения запустите с флагом --apply.
//
// Использование:
//   node scripts/mergeClientFullNames.js            — dry-run по всем tenant
//   node scripts/mergeClientFullNames.js --apply    — применить изменения
//   node scripts/mergeClientFullNames.js --tenant=<tenantId> [--apply]

const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) return
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    value = value.replace(/\$\{([^}]+)\}/g, (_, name) => {
      return process.env[name] ?? ''
    })
    if (process.env[key] === undefined) process.env[key] = value
  })
}

const parseArgs = () => {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--apply' && !/^--tenant=[a-f\d]{24}$/i.test(arg)))
    throw new Error('Некорректные аргументы')
  const tenantArg = args.find((arg) => arg.startsWith('--tenant='))
  return {
    apply: args.includes('--apply'),
    tenantId: tenantArg ? tenantArg.slice('--tenant='.length).trim() : null,
  }
}

const mergeClientFullNames = async (db, { apply = false, tenantId = null } = {}) => {
  // Нативная коллекция: пустая strict-схема Mongoose удаляла все операторы обновления.
  const Clients = db.collection('clients')
  const filter = {
    tenantId: tenantId ? new mongoose.Types.ObjectId(tenantId) : { $type: 'objectId' },
    $or: [
      { secondName: { $regex: /\S/ } },
      { thirdName: { $regex: /\S/ } },
    ],
  }
  const clients = await Clients.find(filter)
    .project({ _id: 1, tenantId: 1, firstName: 1, secondName: 1, thirdName: 1 })
    .toArray()

  // Склейка с защитой от дублей: если часть уже является последним словом
  // накопленной строки (например firstName="Юлия Старостенко" и
  // secondName="Старостенко"), повторно она не добавляется.
  const mergeNameParts = (parts) =>
    parts
      .map((part) => String(part ?? '').trim())
      .filter(Boolean)
      .reduce((acc, part) => {
        if (!acc) return part
        const lastWord = acc.split(/\s+/).pop()
        return lastWord.toLowerCase() === part.toLowerCase()
          ? acc
          : `${acc} ${part}`
      }, '')

  // secondName/thirdName непустые по фильтру, поэтому запись нужна всегда:
  // даже если склейка совпала с firstName, поля надо очистить.
  const planned = clients
    .map((client) => ({
      client,
      merged: mergeNameParts([
        client.firstName,
        client.secondName,
        client.thirdName,
      ]),
    }))
    .filter(({ merged }) => merged)

  const summary = { mode: apply ? 'apply' : 'dry-run', planned: planned.length, modified: 0, conflicts: 0 }
  if (apply && planned.length) {
    const ops = planned.map(({ client, merged }) => ({
      updateOne: {
        filter: {
          _id: client._id,
          tenantId: client.tenantId,
          ...Object.fromEntries(['firstName', 'secondName', 'thirdName'].map((key) => [
            key, client[key] === undefined ? { $exists: false } : { $eq: client[key] },
          ])),
        },
        update: {
          $set: { firstName: merged, secondName: '', thirdName: '', updatedAt: new Date() },
          $inc: { syncVersion: 1 },
        },
      },
    }))
    const result = await Clients.bulkWrite(ops)
    summary.modified = result.modifiedCount ?? 0
    summary.conflicts = planned.length - (result.matchedCount ?? 0)
  }
  return summary
}

const run = async () => {
  const options = parseArgs()
  // Явные переменные/--env-file имеют приоритет над legacy-файлом.
  if (!process.env.MONGODB_URI) loadEnvFile(path.join(__dirname, '..', '.env.local'))
  if (!process.env.MONGODB_URI) {
    console.error('mergeClientFullNames: MONGODB_URI is missing')
    process.exitCode = 1
    return
  }
  const client = new mongoose.mongo.MongoClient(process.env.MONGODB_URI, {
    retryWrites: false, serverSelectionTimeoutMS: 10000,
  })
  try {
    await client.connect()
    const result = await mergeClientFullNames(client.db(process.env.MONGODB_DBNAME), options)
    console.log(JSON.stringify(result, null, 2))
    if (result.conflicts) process.exitCode = 2
  } finally {
    await client.close()
  }
}

module.exports = { mergeClientFullNames }
if (require.main === module) run().catch(() => {
  console.error('mergeClientFullNames: ошибка. Проверьте аргументы, подключение и структуру данных. При сбое часть записей могла обновиться; повторный запуск безопасен.')
  process.exitCode = 1
})
