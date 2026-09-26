import mongoose from 'mongoose'
import nextEnv from '@next/env'
import { pathToFileURL } from 'node:url'
import { TRANSACTION_CATEGORY_ALIASES } from '../helpers/transactionCategory.mjs'

const fail = (code) => { throw Object.assign(new Error(), { code }) }

export const getMigrationErrorDetails = (error) => {
  const knownNames = new Set(['Error', 'TypeError', 'ReferenceError', 'RangeError',
    'MongoServerError', 'MongoParseError', 'MongoInvalidArgumentError',
    'MongoAPIError', 'MongoNetworkError', 'MongoNetworkTimeoutError',
    'MongooseServerSelectionError', 'MongoServerSelectionError', 'MongoRuntimeError'])
  return {
    type: knownNames.has(error?.name) ? error.name : 'UnknownError',
    ...(Number.isSafeInteger(error?.code) ? { code: error.code } : {}),
    ...(Number.isSafeInteger(error?.cause?.code) ? { causeCode: error.cause.code } : {}),
  }
}

export const getMigrationErrorMessage = (error) => {
  const messages = {
    INVALID_ARGUMENTS: 'Неверные параметры. Допустимы --apply и --tenant=<ObjectId>.',
    DUPLICATE_TENANT: 'Параметр --tenant можно указать только один раз.',
    MISSING_URI: 'Не задана MONGODB_URI. Запустите npm run transactions:migrate-categories из корня проекта с настроенным .env.local или задайте переменную окружения.',
    MISSING_DBNAME: 'Не задана MONGODB_DBNAME. Укажите имя тестовой или рабочей базы в .env.local либо окружении процесса.',
  }
  if (Object.hasOwn(messages, error?.code)) return messages[error.code]
  if (error?.code === 18 || error?.cause?.code === 18) return 'MongoDB отклонила авторизацию. Проверьте учётные данные и authSource в MONGODB_URI.'
  if (error?.code === 13) return 'Недостаточно прав MongoDB для чтения или изменения транзакций.'
  if (['MongoParseError', 'MongoInvalidArgumentError'].includes(error?.name)) return 'Некорректные параметры подключения MongoDB. Проверьте формат MONGODB_URI и MONGODB_DBNAME.'
  if (error?.name === 'MongoRuntimeError' && error?.message?.startsWith('Unable to parse ')) return 'Некорректный адрес MongoDB. Проверьте MONGODB_URI и подстановку переменных окружения; запускайте скрипт через npm run transactions:migrate-categories.'
  if (['MongooseServerSelectionError', 'MongoServerSelectionError', 'MongoNetworkError'].includes(error?.name)) return 'Не удалось подключиться к MongoDB. Проверьте, что сервер запущен, адрес доступен и настройки TLS корректны.'
  return 'Не удалось завершить миграцию. Проверьте настройки и доступность MongoDB. Данные подключения не выводятся.'
}

export const migrateTransactionCategories = async (collection, { apply = false, tenantId } = {}) => {
  const query = { category: { $in: Object.keys(TRANSACTION_CATEGORY_ALIASES) } }
  if (tenantId) query.tenantId = tenantId
  const report = { mode: apply ? 'apply' : 'dry-run', found: 0, eligible: 0, updated: 0, conflicts: 0, invalidTenant: 0, invalidVersion: 0, nonIncome: 0, categories: {} }
  const cursor = collection.find(query, {
    projection: { tenantId: 1, category: 1, type: 1, syncVersion: 1, updatedAt: 1 },
  })
  for await (const row of cursor) {
    report.found++
    report.categories[row.category] = (report.categories[row.category] || 0) + 1
    if (row.type !== 'income') report.nonIncome++
    // Never infer ownership for historical rows without a valid tenant.
    if (!(row.tenantId instanceof mongoose.Types.ObjectId)) {
      report.invalidTenant++
      continue
    }
    if (row.syncVersion != null && (!Number.isSafeInteger(row.syncVersion) || row.syncVersion < 1 || row.syncVersion >= Number.MAX_SAFE_INTEGER)) {
      report.invalidVersion++
      continue
    }
    report.eligible++
    if (!apply) continue
    const previous = (field) => Object.hasOwn(row, field) ? row[field] : { $exists: false }
    const result = await collection.updateOne({
      _id: row._id,
      tenantId: row.tenantId,
      category: row.category,
      syncVersion: previous('syncVersion'),
      updatedAt: previous('updatedAt'),
    }, {
      $set: {
        category: TRANSACTION_CATEGORY_ALIASES[row.category],
        syncVersion: (row.syncVersion ?? 1) + 1,
        updatedAt: new Date(),
      },
    })
    if (result.modifiedCount === 1) report.updated++
    else report.conflicts++
  }
  return report
}

const main = async () => {
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log('node scripts/migrateTransactionCategories.mjs [--apply] [--tenant=<ObjectId>]\nDefault: dry-run. Requires MONGODB_URI and MONGODB_DBNAME. Back up the database before --apply.')
    return
  }
  if (args.some((arg) => arg !== '--apply' && !/^--tenant=[a-f\d]{24}$/i.test(arg))) {
    fail('INVALID_ARGUMENTS')
  }
  // Match Next.js, including $VARIABLE / ${VARIABLE} expansion. Node's
  // --env-file preloads literal values and prevents this expansion.
  nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', {
    info: () => {},
    error: () => {},
  })
  if (!process.env.MONGODB_URI?.trim()) fail('MISSING_URI')
  if (!process.env.MONGODB_DBNAME?.trim()) fail('MISSING_DBNAME')
  const tenantArgs = args.filter((arg) => arg.startsWith('--tenant='))
  if (tenantArgs.length > 1) fail('DUPLICATE_TENANT')
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DBNAME,
      serverSelectionTimeoutMS: 10000,
    })
    const report = await migrateTransactionCategories(mongoose.connection.collection('transactions'), {
      apply: args.includes('--apply'),
      tenantId: tenantArgs[0] ? new mongoose.Types.ObjectId(tenantArgs[0].slice(9)) : undefined,
    })
    console.log(JSON.stringify(report, null, 2))
    if (report.conflicts || report.invalidTenant || report.invalidVersion) process.exitCode = 2
  } finally {
    await mongoose.disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Driver errors can contain credentials and connection strings.
    console.error(getMigrationErrorMessage(error))
    console.error(JSON.stringify(getMigrationErrorDetails(error)))
    process.exitCode = 1
  })
}
