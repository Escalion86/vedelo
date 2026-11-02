const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net')
const { spawn } = require('node:child_process'), { once } = require('node:events'), { randomUUID } = require('node:crypto')
const mongoose = require('mongoose')
const { loadBindings, transformSync } = require('next/dist/build/swc')
test('mobile push: one transport per installation, stale registrations, tenant and revoked sessions', { skip: !process.env.PUSH_TEST_MONGOD, timeout: 90000 }, async () => {
  await loadBindings()
  const { registerMobilePushSubscription: register, activeMobilePushSubscriptions: active } = await import('../../server/mobile/pushSubscriptions.mjs')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedelo-push-test-'))
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve))
  const child = spawn(process.env.PUSH_TEST_MONGOD, ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet'], { stdio: 'ignore', windowsHide: true }), exited = once(child, 'exit')
  try {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/push_test`, { serverSelectionTimeoutMS: 30000 })
    const filename = 'models/MobilePushSubscriptions.js'
    const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } })
    const compiledModule = { exports: {} }; new Function('require', 'module', 'exports', code)(id => { assert.equal(id, 'mongoose'); return mongoose }, compiledModule, compiledModule.exports)
    const model = compiledModule.exports.default; await model.init()
    const O = mongoose.Schema.Types.ObjectId
    const sessions = mongoose.model('PushTestSessions', new mongoose.Schema({ tenantId: O, userId: O, deviceId: String, expiresAt: Date, revokedAt: Date }))
    const tenantId = new mongoose.Types.ObjectId(), foreign = new mongoose.Types.ObjectId()
    const session = await sessions.create({ tenantId, userId: tenantId, deviceId: 'device-a', expiresAt: new Date(Date.now() + 60000), revokedAt: null })
    const context = { model, sessions, tenantId, userId: tenantId, sessionId: session._id }
    const body = { installationId: randomUUID(), deliveryId: randomUUID(), revision: 1, provider: 'expo', pushToken: 'ExpoPushToken[test-a]', applicationId: 'ru.escalion.vedelo', showDetails: false }
    await register({ ...context, body }); await register({ ...context, body })
    const newer = { ...body, revision: 2, provider: 'rustore', pushToken: 'rustore-test-token-long-enough' }
    await register({ ...context, body: newer })
    assert.equal(await model.countDocuments({ tenantId }), 1)
    assert.equal((await active({ model, sessions, tenantId }))[0].provider, 'rustore')
    await assert.rejects(register({ ...context, body }), { status: 409 })
    await assert.rejects(register({ ...context, tenantId: foreign, userId: foreign, body: newer }), { status: 401 })
    await assert.rejects(register({ ...context, body: { ...newer, tenantId: foreign } }), { status: 400 })
    assert.deepEqual(await active({ model, sessions, tenantId: foreign }), [])
    await sessions.updateOne({ _id: session._id, tenantId }, { $set: { revokedAt: new Date() } })
    assert.deepEqual(await active({ model, sessions, tenantId }), [])
    await assert.rejects(register({ ...context, body: { ...newer, revision: 3 } }), { status: 401 })
  } finally { await mongoose.disconnect(); child.kill(); await exited.catch(() => {}); fs.rmSync(dir, { recursive: true, force: true }) }
})
test('RuStore data-only delivery hides details, uses bounded TTL, and never deactivates valid tokens for a provider outage', async () => {
  const { mobilePushData, sendRuStorePush } = await import('../../server/ruStorePush.mjs')
  process.env.RUSTORE_PUSH_PROJECT_ID_DEV = 'synthetic-test-project'; process.env.RUSTORE_PUSH_SERVICE_TOKEN_DEV = 'synthetic-service-token'
  try {
    const subscription = { applicationId: 'ru.escalion.vedelo.dev', pushToken: 'synthetic-device-token', deliveryId: randomUUID(), showDetails: false }
    const data = mobilePushData(subscription, { title: 'Private name', body: 'Private conversation', data: { clientId: 'a'.repeat(24), phone: '79991234567' } }, randomUUID())
    assert.ok(!JSON.stringify(data).includes('Private')); assert.equal(data.phone, undefined)
    const result = await sendRuStorePush(subscription, data, async (url, request) => {
      assert.match(url, /^https:\/\/vkpns\.rustore\.ru\//)
      const body = JSON.parse(request.body); assert.equal(body.message.notification, undefined); assert.equal(body.message.android.ttl, '3600s')
      return { ok: false, json: async () => ({ error: { status: 'PERMISSION_DENIED' } }) }
    })
    assert.deepEqual(result, { ok: false, invalid: false })
    assert.deepEqual(await sendRuStorePush(subscription, data, async () => ({ ok: false, json: async () => ({ error: { status: 'UNREGISTERED' } }) })), { ok: false, invalid: true })
  } finally { delete process.env.RUSTORE_PUSH_PROJECT_ID_DEV; delete process.env.RUSTORE_PUSH_SERVICE_TOKEN_DEV }
})
