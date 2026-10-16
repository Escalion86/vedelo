import test from 'node:test'
import assert from 'node:assert/strict'
import { createClientTypesHandlers } from './clientTypes.js'
import { DEFAULT_CLIENT_TYPES, LEGACY_CLIENT_TYPES } from '../helpers/clientTypes.mjs'

function setup() {
  const rows = new Map([
    ['a', { _id: 'settings-a', tenantId: 'a', custom: { keep: true } }],
    ['b', { _id: 'settings-b', tenantId: 'b', clientTypes: [...DEFAULT_CLIENT_TYPES, { value: 'custom_privateb', name: 'Секретный тип', hidden: false }], clientTypesVersion: 8 }],
  ])
  const writes = []
  const Settings = {
    findOne: ({ tenantId }) => ({ lean: async () => structuredClone(rows.get(tenantId) || null) }),
    findOneAndUpdate: (filter, update, options) => ({ lean: async () => {
      writes.push({ filter, update, options })
      const current = rows.get(filter.tenantId)
      const matches = filter.$or ? !current?.clientTypesVersion : filter.clientTypesVersion === current?.clientTypesVersion
      if (!matches) return null
      const saved = { ...current, _id: current?._id || `settings-${filter.tenantId}`, ...update.$set,
        clientTypesVersion: (current?.clientTypesVersion || 0) + 1, syncVersion: (current?.syncVersion || 0) + 1 }
      rows.set(filter.tenantId, saved)
      return structuredClone(saved)
    } }),
  }
  return { rows, writes, ...createClientTypesHandlers({ Settings, connect: async () => {}, getContext: async req => ({ tenantId: req.headers.get('x-test-tenant') }) }) }
}
const req = (tenant, body) => new Request('http://test/api/client-types?tenantId=b', {
  method: body ? 'PUT' : 'GET', headers: tenant ? { 'x-test-tenant': tenant } : {},
  ...(body ? { body: JSON.stringify(body) } : {}),
})

test('authentication required for reads and writes', async () => {
  const h = setup()
  assert.equal((await h.GET(req())).status, 401)
  assert.equal((await h.PUT(req(null, {}))).status, 401)
  assert.equal(h.writes.length, 0)
})
test('tenant negative: query and payload cannot read or overwrite another catalogue', async () => {
  const h = setup()
  const before = structuredClone(h.rows.get('b'))
  const read = await (await h.GET(req('a'))).json()
  assert.equal(read.data.items.some(x => x.name === 'Секретный тип'), false)
  const response = await h.PUT(req('a', { tenantId: 'b', version: 0, items: LEGACY_CLIENT_TYPES }))
  assert.equal(response.status, 200)
  assert.equal(h.writes[0].filter.tenantId, 'a')
  assert.equal(h.writes[0].update.$set.tenantId, 'a')
  assert.deepEqual(h.rows.get('b'), before)
  assert.deepEqual(h.rows.get('a').custom, { keep: true })
})
test('concurrent writes: exactly one succeeds and stale retry cannot overwrite', async () => {
  const h = setup()
  const results = await Promise.all([h.PUT(req('a', { version: 0, items: LEGACY_CLIENT_TYPES })), h.PUT(req('a', { version: 0, items: LEGACY_CLIENT_TYPES }))])
  assert.deepEqual(results.map(x => x.status).sort(), [200, 409])
  assert.equal((await h.PUT(req('a', { version: 0, items: LEGACY_CLIENT_TYPES }))).status, 409)
  assert.equal(h.rows.get('a').clientTypesVersion, 1)
})
test('old types cannot be deleted; new tenant receives universal defaults', async () => {
  const h = setup()
  assert.equal((await h.PUT(req('a', { version: 0, items: DEFAULT_CLIENT_TYPES }))).status, 400)
  assert.deepEqual((await (await h.GET(req('new'))).json()).data.items, DEFAULT_CLIENT_TYPES)
  assert.equal((await h.PUT(req('new', { version: 0, items: DEFAULT_CLIENT_TYPES }))).status, 200)
  assert.equal(h.rows.get('new').clientTypesVersion, 1)
})
