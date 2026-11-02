const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')

test('learning bearer route keeps personal tenant scope, rejects revoked sessions and client identities', async () => {
  await loadBindings()
  const progress = await import('../../server/learningProgress.mjs')
  const rows = new Map(), key = scope => `${scope.tenantId}:${scope.userId}`
  const model = {
    findOne: scope => ({ lean: async () => rows.get(key(scope)) }),
    create: async row => { rows.set(key(row), row) },
    findOneAndUpdate: (scope, update) => ({ lean: async () => {
      const row = rows.get(key(scope))
      if (!row || row.revision !== scope.revision) return null
      const saved = { ...row, ...update.$set }; rows.set(key(scope), saved); return saved
    } }),
  }
  const identities = {
    a: { tenantId: 'a'.repeat(24), user: { _id: '1'.repeat(24) } },
    b: { tenantId: 'b'.repeat(24), user: { _id: '2'.repeat(24) } },
    colleague: { tenantId: 'a'.repeat(24), user: { _id: '3'.repeat(24) } },
  }
  const mocks = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options.status }) } },
    '@server/getRequestContext': async req => identities[req.headers.get('authorization')] || {},
    '@server/dbConnect': async () => {}, '@models/LearningProgress': model,
    '@server/learningProgress.mjs': progress,
  }
  const filename = 'app/api/learning/route.js'
  const { code } = transformSync(readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } })
  const compiledModule = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => { assert.ok(id in mocks, id); return mocks[id] }, compiledModule, compiledModule.exports)
  const req = (identity, body) => ({ headers: new Headers({ authorization: identity }), json: async () => body })
  const saved = await compiledModule.exports.POST(req('a', { action: 'known', articleId: 'deposit' }))
  assert.equal(saved.status, 200)
  assert.deepEqual(saved.body.data.knownIds, ['deposit'])
  for (const identity of ['b', 'colleague']) assert.deepEqual((await compiledModule.exports.GET(req(identity))).body.data.knownIds, [])
  assert.deepEqual((await compiledModule.exports.GET(req('a'))).body.data.knownIds, ['deposit'])
  assert.equal((await compiledModule.exports.POST(req('a', { action: 'read', articleId: 'deposit', tenantId: identities.b.tenantId }))).status, 400)
  assert.equal((await compiledModule.exports.POST(req('revoked', { action: 'known', articleId: 'deposit' }))).status, 401)
  assert.equal(rows.size, 1)
})
