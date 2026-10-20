const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

test('compiled HTTP: phone session -> explicit Yandex link -> NextAuth session -> administrator disables provider', {
  skip: !process.env.YANDEX_TEST_MONGOD || !process.env.NEXT_DIST_DIR,
  timeout: 120000,
}, async () => {
  const mongoPort = await freePort(), appPort = await freePort()
  const base = `http://127.0.0.1:${appPort}`
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedelo-yandex-http-'))
  const mongo = spawn(process.env.YANDEX_TEST_MONGOD, [
    '--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(mongoPort), '--quiet',
  ], { stdio: 'ignore', windowsHide: true })
  const mongoExited = once(mongo, 'exit')
  let app, appExited
  const logs = []
  try {
    const uri = `mongodb://127.0.0.1:${mongoPort}`
    await mongoose.connect(`${uri}/auth_http_test`, { serverSelectionTimeoutMS: 30000 })
    const db = mongoose.connection.db
    const id = new mongoose.Types.ObjectId()
    await db.collection('users').insertOne({
      _id: id, tenantId: id, phone: '79000000001', role: 'dev',
      password: await bcrypt.hash('test-password-only', 10),
    })
    await db.collection('sitesettings').insertOne({
      tenantId: null, socialAuth: { vkEnabled: false, yandexEnabled: true },
    })
    app = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(appPort)], {
      cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env, NODE_ENV: 'production',
        MONGODB_URI: uri, MONGODB_DBNAME: 'auth_http_test',
        NEXTAUTH_URL: base, DOMAIN: base, NEXTAUTH_SECRET: 'local-http-test-secret-not-production',
        YANDEX_ID_CLIENT_ID: 'mock-client', YANDEX_ID_CLIENT_SECRET: 'mock-secret',
        YANDEX_ID_REDIRECT_URI: `${base}/api/yandex-id/callback`,
        VK_AUTH_ENABLED: 'false', TELEFONIP: '', PHONE_SMS_SEND_WEBHOOK: '',
      },
    })
    appExited = once(app, 'exit')
    app.stderr.on('data', (value) => logs.push(String(value)))
    app.stdout.on('data', () => {})
    const jar = new Map()
    const request = async (url, options = {}) => {
      const response = await fetch(`${base}${url}`, {
        ...options, redirect: 'manual',
        headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...options.headers },
      })
      for (const value of response.headers.getSetCookie()) {
        const pair = value.split(';')[0], index = pair.indexOf('=')
        jar.set(pair.slice(0, index), pair.slice(index + 1))
      }
      return response
    }
    let ready = false
    for (let attempt = 0; attempt < 120; attempt++) {
      try { if ((await request('/api/auth/csrf')).ok) { ready = true; break } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    assert.equal(ready, true, logs.join('\n'))
    const signIn = async (provider, fields) => {
      const csrf = await (await request('/api/auth/csrf')).json()
      return request(`/api/auth/callback/${provider}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', origin: base },
        body: new URLSearchParams({ ...fields, csrfToken: csrf.csrfToken, json: 'true', callbackUrl: `${base}/cabinet` }),
      })
    }
    assert.equal((await request('/api/site/phone-auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin: base },
      body: JSON.stringify({ primaryMethod: 'call', yandexEnabled: false }),
    })).status, 403)
    assert.equal((await signIn('credentials', { phone: '79000000001', password: 'test-password-only' })).status, 200)
    const session = await (await request('/api/auth/session')).json()
    assert.equal(session.user._id, String(id))
    const pending = crypto.randomBytes(32).toString('base64url')
    await db.collection('yandexauthflows').insertOne({
      hash: crypto.createHash('sha256').update(pending).digest('hex'),
      kind: 'pending', yandexId: '98765', phone: '79000000001', expiresAt: new Date(Date.now() + 600000),
    })
    jar.set('vedelo_yandex_flow', pending)
    await db.collection('yandexauthflows').updateOne({ kind: 'pending' }, { $set: { phone: '79000000002' } })
    const rejected = await request('/api/yandex-id/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin: base },
      body: JSON.stringify({ action: 'link' }),
    })
    assert.equal(rejected.status, 409)
    assert.equal((await db.collection('users').findOne({ _id: id })).yandexId, undefined)
    await db.collection('yandexauthflows').updateOne({ kind: 'pending' }, { $set: { phone: '79000000001' } })
    const linked = await request('/api/yandex-id/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin: base },
      body: JSON.stringify({ action: 'link' }),
    })
    assert.equal(linked.status, 200, await linked.clone().text())
    const { token } = await linked.json()
    assert.equal((await signIn('yandex', { token })).status, 200)
    const yandexSession = await (await request('/api/auth/session')).json()
    assert.equal(yandexSession.user._id, String(id))
    assert.equal(yandexSession.user.tenantId, String(id))
    assert.equal((await db.collection('users').findOne({ _id: id })).yandexId, '98765')
    const disable = await request('/api/site/phone-auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin: base },
      body: JSON.stringify({ primaryMethod: 'call', vkEnabled: false, yandexEnabled: false }),
    })
    assert.equal(disable.status, 200, await disable.clone().text())
    assert.equal((await request('/api/yandex-id/start')).status, 403)
    const status = await (await request('/api/global/auth/vk-status')).json()
    assert.equal(status.data.allowYandexAuth, false)
    assert.equal(status.data.allowVkAuth, false)
    assert.equal((await request('/api/vk-id/auth', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: 'invalid' }),
    })).status, 403)
  } finally {
    if (app) { app.kill(); await appExited }
    await mongoose.disconnect()
    mongo.kill()
    await mongoExited
  }
})
