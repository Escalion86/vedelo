const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const mongoose = require('mongoose')
const { NextRequest, NextResponse } = require('next/server')
const { loadBindings, transformSync } = require('next/dist/build/swc')

function load(file, mocks, env = {}, fetcher) {
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'process', 'fetch', code)(
    (name) => { if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`); return mocks[name] },
    loaded, loaded.exports, { env }, fetcher,
  )
  return loaded.exports
}

test('Yandex auth: real Mongo, OAuth, single use, linking and tenant isolation', {
  skip: !process.env.YANDEX_TEST_MONGOD, timeout: 90000,
}, async (t) => {
  await loadBindings()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedelo-yandex-test-'))
  const probe = net.createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const child = spawn(process.env.YANDEX_TEST_MONGOD, ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet'], { stdio: 'ignore', windowsHide: true })
  const exited = once(child, 'exit')
  try {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/auth_test`, { serverSelectionTimeoutMS: 30000 })
    const Users = load('models/Users.js', {
      mongoose, '@schemas/usersSchema': {
        phone: String, yandexId: String, vkId: String, tenantId: mongoose.Schema.Types.ObjectId,
        role: String, archive: Boolean,
      },
    }).default
    const Flows = load('models/YandexAuthFlows.js', { mongoose }).default
    const Settings = mongoose.model('AuthTestSettings', new mongoose.Schema({
      tenantId: mongoose.Schema.Types.ObjectId, socialAuth: mongoose.Schema.Types.Mixed,
      phoneVerification: mongoose.Schema.Types.Mixed,
    }))
    await Promise.all([Users.init(), Flows.init()])
    const env = {
      YANDEX_ID_CLIENT_ID: 'test-client', YANDEX_ID_CLIENT_SECRET: 'test-secret',
      YANDEX_ID_REDIRECT_URI: 'https://vedelo.test/api/yandex-id/callback',
      VK_ID_APP_ID: 'vk', VK_ID_CLIENT_SECRET: 'secret', VK_ID_REDIRECT_URI: 'https://vedelo.test/vk',
      VK_AUTH_ENABLED: 'true', NODE_ENV: 'production',
    }
    const settings = load('server/socialAuthSettings.js', {
      '@models/SiteSettings': Settings, '@server/dbConnect': async () => {},
    }, env)
    const global = await Settings.create({ tenantId: null, socialAuth: { yandexEnabled: true } })
    const aId = new mongoose.Types.ObjectId(), bId = new mongoose.Types.ObjectId()
    const a = await Users.create({ _id: aId, tenantId: aId, phone: '79000000001', role: 'user' })
    const b = await Users.create({ _id: bId, tenantId: bId, phone: '79000000002', role: 'user' })
    let context = { user: { _id: aId }, tenantId: String(aId) }
    let profileClient = 'test-client'
    let profilePhone = '+7 (900) 000-00-01'
    const phoneHelpers = load('server/phoneVerification.js', { '@models/Users': Users, 'node:crypto': require('node:crypto') })
    const service = load('server/yandexAuth.js', {
      'node:crypto': require('node:crypto'), '@models/YandexAuthFlows': Flows,
      '@models/Users': Users, '@server/socialAuthSettings': settings,
      '@server/phoneVerification': phoneHelpers,
    }, env, async (url, options) => {
      if (url.endsWith('/token')) {
        assert.equal(options.body.get('client_secret'), 'test-secret')
        assert.ok(options.body.get('code_verifier'))
        return { ok: true, json: async () => ({ access_token: 'provider-secret' }) }
      }
      assert.equal(options.headers.Authorization, 'OAuth provider-secret')
      return { ok: true, json: async () => ({ id: '123', client_id: profileClient, default_phone: { number: profilePhone } }) }
    })
    const mocks = {
      'next/server': { NextResponse }, 'node:crypto': require('node:crypto'),
      '@server/yandexAuth': service, '@models/Users': Users,
      '@server/getTenantContext': async () => context,
      '@server/rateLimit': { checkRateLimit: async () => ({ ok: true }) },
    }
    const start = load('app/api/yandex-id/start/route.js', mocks, env).GET
    const callback = load('app/api/yandex-id/callback/route.js', mocks, env).GET
    const complete = load('app/api/yandex-id/complete/route.js', mocks)
    const request = (secret, body, origin = 'https://vedelo.test') => new NextRequest('https://vedelo.test/api/yandex-id/complete', {
      method: body ? 'POST' : 'GET',
      headers: { cookie: `${service.YANDEX_COOKIE}=${secret}`, origin, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    await t.test('settings use only global record; VK legacy default and explicit off', async () => {
      await Settings.create({ tenantId: aId, socialAuth: { vkEnabled: false, yandexEnabled: false } })
      assert.equal((await settings.getSocialAuthSettings()).allowVkAuth, true)
      assert.equal((await settings.getSocialAuthSettings()).allowYandexAuth, true)
      await Settings.updateOne({ _id: global._id }, { $set: { 'socialAuth.vkEnabled': false } })
      assert.equal((await settings.getSocialAuthSettings()).allowVkAuth, false)
    })
    let pending
    await t.test('OAuth state + PKCE, replay and wrong browser blocked; account selected from server profile', async () => {
      const response = await start(new NextRequest('https://vedelo.test/api/yandex-id/start'))
      const url = new URL(response.headers.get('location'))
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
      assert.equal(url.searchParams.get('scope'), 'login:info login:default_phone')
      assert.equal(response.cookies.get(service.YANDEX_COOKIE).httpOnly, true)
      const state = url.searchParams.get('state')
      const call = (cookie) => callback(new NextRequest(`https://vedelo.test/api/yandex-id/callback?state=${state}&code=test`, { headers: { cookie: `${service.YANDEX_COOKIE}=${cookie}` } }))
      assert.match((await call('wrong')).headers.get('location'), /error=1/)
      const success = await call(state)
      pending = success.cookies.get(service.YANDEX_COOKIE).value
      assert.equal(success.headers.get('location'), 'https://vedelo.test/auth/yandex/complete')
      assert.match((await call(state)).headers.get('location'), /error=1/)
      assert.equal((await Users.findById(aId)).yandexId, undefined)
      assert.deepEqual(await (await complete.GET(request(pending))).json(), { linked: false, accountExists: true, phone: a.phone, referrerId: '' })
      assert.equal(await Users.countDocuments(), 2)
    })
    await t.test('link rejects missing session, forged tenant, cross-origin and impersonation', async () => {
      context = { user: null }
      assert.equal((await complete.POST(request(pending, { action: 'link', userId: aId, tenantId: aId }))).status, 401)
      context = { user: { _id: aId }, tenantId: String(bId) }
      assert.equal((await complete.POST(request(pending, { action: 'link' }))).status, 403)
      context = { user: { _id: aId, impersonation: { active: true } }, tenantId: String(aId) }
      assert.equal((await complete.POST(request(pending, { action: 'link' }))).status, 401)
      context = { user: { _id: aId }, tenantId: String(aId) }
      assert.equal((await complete.POST(request(pending, { action: 'link' }, 'https://evil.test'))).status, 403)
    })
    await t.test('first login by Yandex phone needs no session/password and ignores supplied identity', async () => {
      context = { user: null }
      const response = await complete.POST(request(pending, { action: 'login', userId: bId, tenantId: bId, phone: b.phone }))
      assert.equal(response.status, 200)
      const { token } = await response.json()
      assert.equal((await Users.findById(aId)).yandexId, '123')
      assert.equal((await Users.findById(bId)).yandexId, undefined)
      assert.equal((await complete.POST(request(pending, { action: 'link' }))).status, 410)
      const [first, second] = await Promise.all([service.consumeYandexTicket(token), service.consumeYandexTicket(token)])
      assert.equal([first, second].filter(Boolean).length, 1)
      assert.equal((first || second).tenantId, String(aId))
    })
    await t.test('linked identity cannot be moved to another account', async () => {
      context = { user: { _id: bId }, tenantId: String(bId) }
      const secret = await service.createFlow('pending', { yandexId: '123', phone: a.phone })
      assert.equal((await complete.POST(request(secret, { action: 'link' }))).status, 409)
      assert.equal((await Users.findById(aId)).yandexId, '123')
      await assert.rejects(Users.updateOne({ _id: bId }, { $set: { yandexId: '123' } }), { code: 11000 })
      assert.equal((await Users.findById(bId)).yandexId, undefined)
    })
    await t.test('phone required, normalized; changed phone never transfers account', async () => {
      assert.deepEqual(await service.exchangeProfile('code', 'verifier'), { yandexId: '123', phone: a.phone })
      for (const value of [undefined, '', '+1 555 123 4567']) {
        profilePhone = value
        await assert.rejects(service.exchangeProfile('code', 'verifier'), /YANDEX_PHONE_REQUIRED/)
      }
      profilePhone = ''
      const startResponse = await start(new NextRequest('https://vedelo.test/api/yandex-id/start'))
      const state = new URL(startResponse.headers.get('location')).searchParams.get('state')
      const missingPhone = await callback(new NextRequest(`https://vedelo.test/api/yandex-id/callback?state=${state}&code=test`, {
        headers: { cookie: `${service.YANDEX_COOKIE}=${state}` },
      }))
      assert.match(missingPhone.headers.get('location'), /error=phone_required/)
      profilePhone = a.phone
      const changed = await service.createFlow('pending', { yandexId: '123', phone: b.phone })
      assert.equal((await complete.GET(request(changed))).status, 409)
      assert.equal((await complete.POST(request(changed, { action: 'login' }))).status, 409)
      const missing = await service.createFlow('pending', { yandexId: '123' })
      assert.equal((await complete.POST(request(missing, { action: 'login' }))).status, 409)
      const wrong = await service.createFlow('pending', { yandexId: '456', phone: a.phone })
      context = { user: { _id: bId }, tenantId: String(bId) }
      assert.equal((await complete.POST(request(wrong, { action: 'link' }))).status, 409)
      const ticket = await service.createFlow('ticket', { userId: aId, tenantId: aId, yandexId: '123', phone: a.phone })
      await Users.updateOne({ _id: aId }, { $set: { phone: '79000000003' } })
      assert.equal(await service.consumeYandexTicket(ticket), null)
      await Users.updateOne({ _id: aId }, { $set: { phone: a.phone } })
    })
    await t.test('new phone registration can link only its own account', async () => {
      const phone = '79000000004'
      const secret = await service.createFlow('pending', { yandexId: '444', phone })
      const info = await (await complete.GET(request(secret))).json()
      assert.equal(info.accountExists, false)
      assert.equal(info.phone, phone)
      assert.equal((await complete.POST(request(secret, { action: 'login' }))).status, 409)
      const id = new mongoose.Types.ObjectId()
      await Users.create({ _id: id, tenantId: id, phone, role: 'user' })
      context = { user: { _id: id }, tenantId: String(id) }
      const result = await complete.POST(request(secret, { action: 'link' }))
      assert.equal(result.status, 200)
      assert.equal((await service.consumeYandexTicket((await result.json()).token)).tenantId, String(id))
    })
    await t.test('legacy tenant restored; concurrent login and conflicting identities are safe', async () => {
      const id = new mongoose.Types.ObjectId()
      const phone = '79000000005'
      await Users.create({ _id: id, phone, role: 'user' })
      const secret = await service.createFlow('pending', { yandexId: '555', phone })
      const responses = await Promise.all([complete.POST(request(secret, { action: 'login' })), complete.POST(request(secret, { action: 'login' }))])
      assert.equal(responses.filter(r => r.status === 200).length, 1)
      const success = responses.find(r => r.status === 200)
      const session = await service.consumeYandexTicket((await success.json()).token)
      assert.equal(session.tenantId, String(id))
      const conflict = await service.createFlow('pending', { yandexId: '666', phone })
      assert.equal((await complete.POST(request(conflict, { action: 'login' }))).status, 409)
      assert.equal((await Users.findById(id)).yandexId, '555')
      await Users.updateOne({ _id: id }, { $set: { archive: true } })
      const archived = await service.createFlow('pending', { yandexId: '555', phone })
      assert.equal((await complete.POST(request(archived, { action: 'login' }))).status, 409)
    })
    await t.test('repeat login uses saved ID, rejects archived account, expired state and disabled provider', async () => {
      const secret = await service.createFlow('pending', { yandexId: '123', phone: a.phone })
      const response = await complete.POST(request(secret, { action: 'login' }))
      assert.equal(response.status, 200)
      const { token } = await response.json()
      await Users.updateOne({ _id: aId }, { $set: { archive: true } })
      assert.equal(await service.consumeYandexTicket(token), null)
      await Users.updateOne({ _id: aId }, { $set: { archive: false } })
      const expired = await service.createFlow('pending', { yandexId: '123', phone: a.phone })
      await Flows.updateOne({ hash: service.hashToken(expired) }, { $set: { expiresAt: new Date(0) } })
      assert.equal((await complete.GET(request(expired))).status, 410)
      const ticket = await service.createFlow('ticket', { userId: aId, tenantId: aId, yandexId: '123', phone: a.phone })
      await Settings.updateOne({ _id: global._id }, { $set: { 'socialAuth.yandexEnabled': false } })
      assert.equal((await complete.POST(request(expired, { action: 'login' }))).status, 403)
      assert.equal((await start(new NextRequest('https://vedelo.test/api/yandex-id/start'))).status, 403)
      assert.equal(await service.consumeYandexTicket(ticket), null)
    })
    await t.test('provider application mismatch rejected', async () => {
      profileClient = 'another-client'
      await assert.rejects(service.exchangeProfile('code', 'verifier'), /YANDEX_PROFILE_INVALID/)
    })
    await t.test('generic CRUD cannot assign provider identities or rename fields into them', async () => {
      const { hasProtectedAuthFields } = await import('../../helpers/protectedAuthFields.mjs')
      for (const payload of [{ yandexId: '123' }, { $set: { yandexId: '123' } }, { $unset: { yandexId: 1 } }, { $rename: { phone: 'yandexId' } }])
        assert.equal(hasProtectedAuthFields(payload), true)
      assert.equal(hasProtectedAuthFields({ firstName: 'Имя' }), false)
    })
    await t.test('VK disabled blocks direct exchange and previously issued NextAuth ticket', async () => {
      const vk = load('app/api/vk-id/auth/route.js', {
        'next/server': { NextResponse }, mongoose,
        '@server/socialAuthSettings': settings,
        '@server/dbConnect': async () => {},
        '@server/ensureVkUser': {},
        '@server/vkIdAuth': {},
        '@server/vkidAuthToken': {},
        '@server/getAuthSecret': () => 'test',
        '@server/phoneVerification': {},
        '@server/rateLimit': {},
        '@helpers/registrationSource.mjs': {},
      })
      assert.equal((await vk.POST(request('', { access_token: 'old-token' }))).status, 403)
      const options = load('app/api/auth/[...nextauth]/_options.js', {
        'next-auth/providers/credentials': (value) => value, bcryptjs: {},
        '@server/dbConnect': async () => {}, '@models/Users': Users,
        '@server/vkidAuthToken': { verifyVkIdAuthToken: () => { throw new Error('Must check enabled first') } },
        '@server/getAuthSecret': () => 'test', '@server/impersonationTicket': {},
        '@server/domainMigration': {}, '@helpers/brand.mjs': { BRAND: {} },
        '@server/socialAuthSettings': settings, '@server/yandexAuth': service,
      }).default
      assert.equal(await options.providers.find((p) => p.id === 'vkid').authorize({ token: 'old-ticket' }), null)
    })
    await t.test('admin settings reject ordinary users and enable only configured providers', async () => {
      let admin = { user: { _id: aId, role: 'user' }, tenantId: String(aId) }
      const adminRoute = load('app/api/site/phone-auth/route.js', {
        'next/server': { NextResponse }, '@models/SiteSettings': Settings,
        '@server/getTenantContext': async () => admin,
        '@server/socialAuthSettings': settings,
        '@server/telefonipBalance': { getTelefonipBalance: async () => ({ status: 'unconfigured' }) },
        '@server/phoneAuthSettings': {
          getPhoneAuthSettings: async () => ({ primaryMethod: 'call' }),
          getPhoneProviderStatus: () => ({ callConfigured: false, smsConfigured: false }),
        },
      })
      const body = { primaryMethod: 'call', vkEnabled: false, yandexEnabled: true }
      assert.equal((await adminRoute.POST(request('', body))).status, 403)
      assert.equal((await adminRoute.GET()).status, 403)
      admin.user.role = 'dev'
      assert.equal((await adminRoute.POST(request('', body))).status, 200)
      assert.equal((await settings.getSocialAuthSettings()).allowYandexAuth, true)
      env.YANDEX_ID_CLIENT_SECRET = ''
      assert.equal((await adminRoute.POST(request('', body))).status, 400)
      admin.user.impersonation = { active: true }
      assert.equal((await adminRoute.POST(request('', body))).status, 403)
    })
  } finally {
    await mongoose.disconnect()
    child.kill()
    await exited
  }
})
