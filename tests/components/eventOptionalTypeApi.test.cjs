const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')

test('event API accepts missing/cleared type and preserves tenant isolation', async () => {
  await loadBindings()
  const normalization = await import('../../server/eventApiNormalization.js')
  let tenantId = 'tenant-a'
  let stored
  const doc = (data) => ({ ...data, toJSON: () => data })
  const Events = {
    create: async (data) => { stored = { ...data, _id: 'event-1' }; return doc(stored) },
    findById: () => ({ lean: async () => stored }),
    findOne: (filter) => ({ lean: async () => filter.tenantId === stored.tenantId ? stored : null }),
    findOneAndUpdate: async (filter, update) => {
      assert.equal(filter.tenantId, stored.tenantId)
      stored = { ...stored, ...update }
      return doc(stored)
    },
    findByIdAndUpdate: async (_id, update) => { stored = { ...stored, ...update }; return doc(stored) },
  }
  const mocks = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options.status }) } },
    '@models/Events': Events,
    '@server/dbConnect': async () => {},
    '@server/getRequestContext': async () => ({ tenantId, user: tenantId ? { _id: 'user' } : null }),
    '@server/getUserTariffAccess': async () => ({ hasTariff: true, eventsPerMonth: Infinity }),
    '@server/eventApiNormalization': normalization,
    '@server/tenantTerminology': { getTenantWorkItemTerminology: async () => ({ labelCapitalized: 'Мероприятие', mode: 'events' }) },
    '@server/activityHistory': { recordActivityHistory: async () => {} },
    '@server/acquisitionFunnel': { recordCrmItemCreated: async () => {} },
    '@helpers/compareObjectsWithDif': () => ({}),
  }
  const load = (filename) => {
    const { code } = transformSync(readFileSync(filename, 'utf8'), {
      filename, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' },
    })
    const mod = { exports: {} }
    new Function('require', 'module', 'exports', code)((id) => id in mocks ? mocks[id] : id.startsWith('@') ? {} : require(id), mod, mod.exports)
    return mod.exports
  }
  const { POST } = load('app/api/events/route.js')
  const { PUT } = load('app/api/events/[id]/route.js')
  const request = (body) => ({ json: async () => body })
  const params = { params: Promise.resolve({ id: 'event-1' }) }
  for (const status of ['draft', 'active']) {
    const created = await POST(request({ status, tenantId: 'forged-tenant' }))
    assert.equal(created.status, 201)
    assert.equal(stored.eventType, '')
    assert.equal(stored.tenantId, 'tenant-a')
    assert.equal((await PUT(request({ eventType: ' Свадьба ' }), params)).status, 200)
    assert.equal(stored.eventType, 'Свадьба')
    assert.equal((await PUT(request({ eventType: '' }), params)).status, 200)
    assert.equal(stored.eventType, '')
  }
  tenantId = 'tenant-b'
  assert.equal((await PUT(request({ eventType: '' }), params)).status, 404)
  assert.equal(stored.tenantId, 'tenant-a')
  tenantId = null
  assert.equal((await POST(request({ status: 'draft' }))).status, 401)
  assert.equal((await PUT(request({ eventType: '' }), params)).status, 401)
})
