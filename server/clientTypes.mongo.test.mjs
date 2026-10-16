import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import mongoose from 'mongoose'
import schema from '../schemas/siteSettingsSchema.js'
import { createClientTypesHandlers } from './clientTypes.js'
import { DEFAULT_CLIENT_TYPES, LEGACY_CLIENT_TYPES } from '../helpers/clientTypes.mjs'

test('real Mongo: legacy defaults, tenant isolation, atomic concurrent writes and new settings upsert', {
  skip: !process.env.CLIENT_TYPES_TEST_MONGOD, timeout: 60000,
}, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vedelo-client-types-'))
  const probe = net.createServer()
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const child = spawn(process.env.CLIENT_TYPES_TEST_MONGOD, ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet'], { stdio: 'ignore', windowsHide: true })
  const exited = once(child, 'exit')
  let connection
  try {
    connection = await mongoose.createConnection(`mongodb://127.0.0.1:${port}/client_types_test`, { serverSelectionTimeoutMS: 30000 }).asPromise()
    const modelSchema = new mongoose.Schema(schema, { timestamps: true })
    modelSchema.index({ tenantId: 1 }, { unique: true })
    const Settings = connection.model('ClientTypeSettingsTest', modelSchema)
    await Settings.init()
    const a = new mongoose.Types.ObjectId(), b = new mongoose.Types.ObjectId(), c = new mongoose.Types.ObjectId()
    await Settings.collection.insertOne({ tenantId: a, custom: { keep: true } })
    await Settings.create({ tenantId: b })
    const handlers = createClientTypesHandlers({ Settings, connect: async () => {}, getContext: async req => ({ tenantId: req.headers.get('x-tenant') }) })
    const request = (tenant, body) => new Request('http://test/api/client-types', { method: body ? 'PUT' : 'GET', headers: { 'x-tenant': String(tenant) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    assert.deepEqual((await (await handlers.GET(request(a))).json()).data.items, LEGACY_CLIENT_TYPES)
    assert.deepEqual((await (await handlers.GET(request(b))).json()).data.items, DEFAULT_CLIENT_TYPES)
    const beforeB = await Settings.findOne({ tenantId: b }).lean()
    const renamed = LEGACY_CLIENT_TYPES.map(x => x.value === 'colleague' ? { ...x, name: 'Исполнитель', hidden: true } : x)
    const writes = await Promise.all([1, 2].map(() => handlers.PUT(request(a, { tenantId: String(b), version: 0, items: renamed }))))
    assert.deepEqual(writes.map(x => x.status).sort(), [200, 409])
    const actual = await Settings.findOne({ tenantId: a }).lean()
    assert.equal(actual.clientTypesVersion, 1)
    assert.equal(actual.syncVersion, 1)
    assert.deepEqual(actual.custom, { keep: true })
    assert.deepEqual(actual.clientTypes, renamed)
    assert.deepEqual(await Settings.findOne({ tenantId: b }).lean(), beforeB)
    const creates = await Promise.all([1, 2].map(() => handlers.PUT(request(c, { version: 0, items: DEFAULT_CLIENT_TYPES }))))
    assert.deepEqual(creates.map(x => x.status).sort(), [200, 409])
    assert.equal((await Settings.findOne({ tenantId: c }).lean()).clientTypesVersion, 1)
  } finally {
    if (connection) await connection.close()
    child.kill()
    await exited
    const target = path.resolve(directory)
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('vedelo-client-types-'))
    await rm(target, { recursive: true, force: true })
  }
})
