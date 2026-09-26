import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import { migrateTransactionCategories, getMigrationErrorMessage, getMigrationErrorDetails } from './migrateTransactionCategories.mjs'
import { normalizeTransactionCategory, TRANSACTION_CATEGORY_ALIASES } from '../helpers/transactionCategory.mjs'
const mongodBinary = process.env.MONGOD_BINARY || 'mongod'
const mongodAvailable = spawnSync(mongodBinary, ['--version'], {
  stdio: 'ignore',
  windowsHide: true,
}).status === 0

const getFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    server.close((error) => error ? reject(error) : resolve(port))
  })
})

const waitForPort = async (port, processRef) => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) throw new Error('mongod завершился до запуска тестов')
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => resolve(false))
      socket.setTimeout(250, () => { socket.destroy(); resolve(false) })
    })
    if (connected) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('mongod не запустился за 10 секунд')
}

test('normalization preserves canonical and unknown categories', () => {
  for (const [legacy, category] of Object.entries(TRANSACTION_CATEGORY_ALIASES)) {
    assert.equal(normalizeTransactionCategory(legacy), category)
    assert.equal(normalizeTransactionCategory(category), category)
  }
  assert.equal(normalizeTransactionCategory(' taxes '), 'taxes')
  assert.equal(normalizeTransactionCategory('toString'), 'toString')
  assert.equal(normalizeTransactionCategory(null), 'other')
})

test('safe diagnostics distinguish configuration, authentication and network errors', () => {
  assert.match(getMigrationErrorMessage({ code: 'MISSING_URI' }), /MONGODB_URI/)
  assert.match(getMigrationErrorMessage({ code: 'MISSING_DBNAME' }), /MONGODB_DBNAME/)
  assert.match(getMigrationErrorMessage({ code: 18 }), /авторизацию/)
  assert.match(getMigrationErrorMessage({ name: 'MongooseServerSelectionError' }), /подключиться/)
  for (const error of [
    { name: 'MongoParseError', message: 'mongodb://secret:password@private-host' },
    { message: 'mongodb://secret:password@private-host' },
  ]) assert.doesNotMatch(getMigrationErrorMessage(error), /secret|password|private-host/)
  assert.deepEqual(getMigrationErrorDetails({name:'MongoRuntimeError', message:'secret'}), {type:'MongoRuntimeError'})
  assert.deepEqual(getMigrationErrorDetails({name:'secret', code:'password'}), {type:'UnknownError'})
})

test('CLI reports missing environment without exposing values', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'vedelo-migration-config-'))
  try {
  const env = { ...process.env }
  delete env.MONGODB_URI
  delete env.MONGODB_DBNAME
  const script = path.join(import.meta.dirname, 'migrateTransactionCategories.mjs')
  const missing = spawnSync(process.execPath, [script], { cwd, env, encoding: 'utf8', windowsHide: true })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /Не задана MONGODB_URI/)
  const missingDb = spawnSync(process.execPath, [script], {
    env: { ...env, MONGODB_URI: 'mongodb://secret:password@private-host' },
    cwd, encoding: 'utf8', windowsHide: true,
  })
  assert.equal(missingDb.status, 1)
  assert.match(missingDb.stderr, /Не задана MONGODB_DBNAME/)
  assert.doesNotMatch(missingDb.stderr, /secret|password|private-host/)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})

test('migration: real MongoDB, dry-run, tenant isolation, preservation and retry', {
  skip: !mongodAvailable,
}, async () => {
  const dbPath = await mkdtemp(path.join(os.tmpdir(), 'vedelo-category-test-'))
  const port = await getFreePort()
  const mongod = spawn(mongodBinary, ['--dbpath', dbPath, '--port', String(port), '--bind_ip', '127.0.0.1', '--noauth', '--quiet'], { stdio: 'ignore', windowsHide: true })
  let connection
  try {
    await waitForPort(port, mongod)
    connection = await mongoose.createConnection(`mongodb://127.0.0.1:${port}/migration_test`).asPromise()
    const collection = connection.collection('transactions')
    const tenantId = new mongoose.Types.ObjectId()
    const foreignTenant = new mongoose.Types.ObjectId()
    const date = new Date('2025-01-01')
    const rows = Object.keys(TRANSACTION_CATEGORY_ALIASES).map((category) => ({
      _id: new mongoose.Types.ObjectId(), tenantId, category, amount: 1500,
      type: 'income', date, createdAt: date, updatedAt: date, syncVersion: 4,
      paymentMethod: 'obligation', comment: 'fixture', eventId: new mongoose.Types.ObjectId(),
    }))
    rows[2].type = 'expense'
    await collection.insertMany([...rows,
      { tenantId: foreignTenant, category: 'advance' },
      { category: 'advance' },
      { tenantId, category: 'advance', syncVersion: 'invalid' },
      { tenantId, category: 'taxes', syncVersion: 1 },
    ])
    const before = await collection.find({}).toArray()
    // Exercise the real CLI with a synthetic Next.js env file and interpolation.
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const command = pkg.scripts['transactions:migrate-categories'].split(' ')
    assert.equal(command[1], 'scripts/migrateTransactionCategories.mjs')
    await writeFile(path.join(dbPath, '.env.local'), `QA_MONGO_PORT=${port}\nQA_MONGO_HOST=127.0.0.1\nMONGODB_URI=mongodb://$QA_MONGO_HOST:\${QA_MONGO_PORT}\nMONGODB_DBNAME=migration_test\n`)
    const cliEnv = { ...process.env }
    delete cliEnv.MONGODB_URI
    delete cliEnv.MONGODB_DBNAME
    const cli = spawnSync(process.execPath, [path.resolve(import.meta.dirname, 'migrateTransactionCategories.mjs'), `--tenant=${tenantId}`], {
      cwd: dbPath, env: cliEnv, encoding: 'utf8', windowsHide: true,
    })
    assert.equal(cli.status, 2, cli.stderr) // The deliberately invalid syncVersion is reported.
    assert.equal(JSON.parse(cli.stdout).mode, 'dry-run')
    assert.equal(JSON.parse(cli.stdout).eligible, 3)
    assert.deepEqual(await collection.find({}).toArray(), before)
    const dry = await migrateTransactionCategories(collection, { tenantId })
    assert.equal(dry.eligible, 3)
    assert.equal(dry.invalidVersion, 1)
    assert.equal(dry.nonIncome, 2)
    assert.deepEqual(await collection.find({}).toArray(), before)
    const applied = await migrateTransactionCategories(collection, { apply: true, tenantId })
    assert.equal(applied.updated, 3)
    for (const original of rows) {
      const migrated = await collection.findOne({ _id: original._id })
      assert.equal(migrated.category, TRANSACTION_CATEGORY_ALIASES[original.category])
      assert.equal(migrated.syncVersion, 5)
      assert.ok(migrated.updatedAt > date)
      const { category, syncVersion, updatedAt, ...unchanged } = migrated
      assert.deepEqual(unchanged, Object.fromEntries(Object.entries(original).filter(([key]) => !['category', 'syncVersion', 'updatedAt'].includes(key))))
    }
    assert.equal((await collection.findOne({ tenantId: foreignTenant })).category, 'advance')
    assert.equal((await migrateTransactionCategories(collection, { apply: true, tenantId })).updated, 0)
    const all = await migrateTransactionCategories(collection, { apply: true })
    assert.equal(all.invalidTenant, 1)
    assert.equal(all.updated, 1)
    assert.equal((await collection.findOne({ tenantId: foreignTenant })).syncVersion, 2)
    // A concurrent edit after the cursor snapshot must win over migration.
    const conflictRow = { ...rows[0], category: 'advance' }
    const conflict = await migrateTransactionCategories({
      find: () => [conflictRow],
      updateOne: (filter, update) => collection.updateOne(filter, update),
    }, { apply: true, tenantId })
    assert.equal(conflict.conflicts, 1)
    assert.equal(conflict.updated, 0)
  } finally {
    await connection?.close()
    if (mongod.exitCode === null) {
      const exited = once(mongod, 'exit')
      mongod.kill()
      await exited
    }
    await rm(dbPath, { recursive: true, force: true })
  }
})

