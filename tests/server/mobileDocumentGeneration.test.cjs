const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const crypto = require('node:crypto')

async function fixture() {
  await loadBindings()
  const state = { tenantId: 'tenant-a', allowDocuments: true, calls: [], created: new Map() }
  class EntityDocumentError extends Error {
    constructor(code, message, status) { super(message); this.code = code; this.status = status }
  }
  const mocks = {
    'node:crypto': crypto,
    '@server/dbConnect': async () => {},
    '@server/getRequestContext': async () => ({ tenantId: state.tenantId, user: state.tenantId ? { _id: 'user-a' } : null }),
    '@server/getUserTariffAccess': async () => ({ allowDocuments: state.allowDocuments }),
    '@server/entityDocumentFiles': { EntityDocumentError },
    '@server/mobile/routeHelpers': {
      mobileSuccess: data => ({ status: 200, body: { success: true, data } }),
      mobileError: (code, message, status) => ({ status, body: { success: false, error: { code, message } } }),
    },
    '@server/webDocumentGeneration': { generateWebDocument: async input => {
      state.calls.push(input)
      if (!input.access.allowDocuments) throw new EntityDocumentError('FORBIDDEN', 'Недоступно', 403)
      if (input.tenantId !== 'tenant-a' || input.eventId !== 'draft') throw new EntityDocumentError('NOT_FOUND', 'Не найдено', 404)
      if (!state.created.has(input.body.requestId)) state.created.set(input.body.requestId, { document: { id: input.body.requestId }, entity: { _id: input.eventId, status: 'draft' } })
      return state.created.get(input.body.requestId)
    } },
  }
  const filename = 'app/api/mobile/v1/events/[id]/documents/generate/route.js'
  const { code } = transformSync(readFileSync(filename, 'utf8'), { filename, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } })
  const compiledModule = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => { assert.ok(name in mocks, name); return mocks[name] }, compiledModule, compiledModule.exports)
  return { state, post: (body, id = 'draft') => compiledModule.exports.POST({ json: async () => body }, { params: Promise.resolve({ id }) }) }
}
test('mobile wrapper delegates draft/retry/source to the common workflow and retains legacy event DTO', async () => {
  const f = await fixture(), requestId = crypto.randomUUID()
  const payload = { templateId: 'template', documentDate: '2026-10-31', requestId, source: 'proposal', allowEmpty: false }
  const first = await f.post(payload), retry = await f.post(payload)
  assert.equal(first.status, 200); assert.deepEqual(first, retry)
  assert.equal(f.state.created.size, 1)
  assert.equal(first.body.data.event.status, 'draft')
  assert.equal(f.state.calls[0].body.requestId, requestId)
  assert.equal(f.state.calls[0].body.allowEmpty, false)
})
test('mobile wrapper ignores client tenant/access and propagates tariff/foreign ownership rejection', async () => {
  const f = await fixture()
  const payload = { requestId: crypto.randomUUID(), tenantId: 'foreign', access: { allowDocuments: true } }
  f.state.allowDocuments = false
  assert.equal((await f.post(payload)).status, 403)
  f.state.allowDocuments = true
  assert.equal((await f.post(payload, 'foreign-event')).status, 404)
  assert.equal(f.state.calls[0].tenantId, 'tenant-a')
  assert.equal(f.state.calls[0].body.tenantId, undefined)
  f.state.tenantId = null
  assert.equal((await f.post(payload)).status, 401)
  assert.equal(f.state.calls.length, 2)
})
test('old APK requests remain supported; malformed bodies do not call the workflow', async () => {
  const f = await fixture()
  assert.equal((await f.post([])).status, 400)
  assert.equal(f.state.calls.length, 0)
  assert.equal((await f.post({ templateId: 'template', documentDate: '2026-10-31' })).status, 200)
  assert.match(f.state.calls[0].body.requestId, /^[a-f\d-]{36}$/)
  assert.equal(f.state.calls[0].body.allowEmpty, true)
})
