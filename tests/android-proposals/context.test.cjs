const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
test.before(() => loadBindings())
function load() {
  const path = 'server/proposalRequestContext.js'
  assert.ok(fs.existsSync(path), 'Приватный request context КП отсутствует')
  let calls = 0
  const { code } = transformSync(fs.readFileSync(path, 'utf8'), {
    filename: path,
    jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => {
      assert.equal(name, '@server/getRequestContext')
      return async (req) => {
        calls++
        return req?.headers?.get('authorization') === 'Bearer valid'
          ? { user: { _id: 'u' }, tenantId: 'a', authType: 'mobile' }
          : req?.headers?.get('authorization')?.startsWith('Bearer ')
            ? { user: null, tenantId: null, authType: 'mobile' }
            : {
                user: { _id: 'cookie-user' },
                tenantId: 'cookie-tenant',
                authType: 'web',
              }
      }
    },
    mod,
    mod.exports
  )
  return { context: mod.exports.default, calls: () => calls }
}
const req = (header) => ({ headers: { get: () => header } })
test('no authorization header preserves cookie web context', async () => {
  const f = load()
  const result = await f.context(req(null))
  assert.equal(result.tenantId, 'cookie-tenant')
  assert.equal(f.calls(), 1)
})
test('valid bearer uses tenant from authenticated context', async () => {
  const f = load()
  const result = await f.context(req('Bearer valid'))
  assert.equal(result.tenantId, 'a')
  assert.equal(result.authType, 'mobile')
})
test('invalid bearer cannot fall back to an available web cookie', async () => {
  const f = load()
  const result = await f.context(req('Bearer invalid'))
  assert.equal(result.user, null)
  assert.equal(result.tenantId, null)
})
test('malformed/case-changed Bearer never falls back to cookie', async () => {
  for (const header of [
    'Bearer',
    'Bearer ',
    'bearer valid',
    'Bearer valid extra',
    'Bearer\tvalid',
  ]) {
    const f = load()
    const result = await f.context(req(header))
    assert.equal(result.user, null, header)
    assert.equal(result.tenantId, null, header)
    assert.equal(f.calls(), 0, header)
  }
})
