const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const { NextResponse } = require('next/server')
const load = (file, mocks) => {
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), { filename: file, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => { if (!(id in mocks)) throw new Error(id); return mocks[id] }, module, module.exports)
  return module.exports
}
test.before(async () => { await loadBindings() })
for (const mobile of [false, true]) {
 test(`${mobile ? 'Android' : 'PWA'}: статус и установка доступны только своему авторизованному пользователю`, async () => {
  let context = { user: { _id: 'u1' }, tenantId: 't1' }
  let input
  const shared = { PASSWORD_ERROR_MESSAGES: {}, getPasswordStatus: async (arg) => { input = arg; return { ok: true, hasPassword: false } }, changeOrSetPassword: async (arg) => { input = arg; return { ok: true, mode: 'set' } } }
  const mocks = {
   'next/server': { NextResponse }, bcryptjs: require('bcryptjs'), '@server/dbConnect': async () => {},
   '@server/getTenantContext': async () => context,
   '@server/getRequestContext': async () => context,
   '@server/passwordChange': shared,
   '@models/Users': { findOne: async () => ({ _id: 'u1', tenantId: 't1' }) },
   '@server/mobile/sessions': { revokeAllMobileSessions: async () => {}, createMobileSession: async () => ({ user: { _id: 'u1' } }) },
   '@server/mobile/routeHelpers': { mobileError: (code, message, status) => NextResponse.json({ success: false, error: { code, message } }, { status }), mobileSuccess: (data) => NextResponse.json({ success: true, data }), getMobileDevice: () => ({}) },
  }
  const route = load(mobile ? 'app/api/mobile/v1/auth/change-password/route.js' : 'app/api/auth/change-password/route.js', mocks)
  assert.equal(typeof route.GET, 'function')
  let response = await route.GET(new Request('http://localhost'))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal((mobile ? body.data : body).hasPassword, false)
  assert.deepEqual(input, { userId: 'u1', tenantId: 't1' })
  const req = () => new Request('http://localhost', { method: 'POST', body: JSON.stringify({ newPassword: 'new-test-123', userId: 'foreign', tenantId: 'foreign', hasPassword: false }) })
  response = await route.POST(req())
  assert.equal(response.status, 200)
  assert.equal(input.userId, 'u1'); assert.equal(input.tenantId, 't1')
  context = { user: null, tenantId: null }
  assert.equal((await route.GET(new Request('http://localhost'))).status, 401)
  assert.equal((await route.POST(req())).status, 401)
 })
}
