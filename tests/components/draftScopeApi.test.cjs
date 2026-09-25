const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')

test('draft scope returns only session tenant drafts including past dates and rejects anonymous requests', async () => {
  await loadBindings()
  let tenantId = 'tenant-a'
  let reads = 0
  const rows = [
    {
      _id: 'past-draft',
      tenantId: 'tenant-a',
      status: 'draft',
      eventDate: '2020-01-01',
    },
    { _id: 'undated', tenantId: 'tenant-a', status: 'draft' },
    { _id: 'active', tenantId: 'tenant-a', status: 'active' },
    { _id: 'foreign', tenantId: 'tenant-b', status: 'draft' },
  ]
  const mocks = {
    'next/server': {
      NextResponse: {
        json: (body, options) => ({ body, status: options.status }),
      },
    },
    '@models/Events': {
      find: (filter) => {
        reads++
        assert.deepEqual(filter, { tenantId, status: 'draft' })
        return {
          sort: () => ({
            lean: async () =>
              rows.filter(
                (row) =>
                  row.tenantId === filter.tenantId &&
                  row.status === filter.status
              ),
          }),
        }
      },
    },
    '@server/dbConnect': async () => {},
    '@server/getRequestContext': async () => ({ tenantId }),
    '@server/tenantTerminology': {
      getTenantWorkItemTerminology: async () => ({}),
    },
  }
  const filename = 'app/api/events/route.js'
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: { parser: { syntax: 'ecmascript' } },
    module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (id) => mocks[id] ?? {},
    mod,
    mod.exports
  )
  const req = {
    url: 'http://localhost/api/events?scope=drafts&tenantId=tenant-b',
  }
  assert.deepEqual(
    (await mod.exports.GET(req)).body.data.map((row) => row._id),
    ['past-draft', 'undated']
  )
  tenantId = 'tenant-b'
  assert.deepEqual(
    (await mod.exports.GET(req)).body.data.map((row) => row._id),
    ['foreign']
  )
  tenantId = null
  assert.equal((await mod.exports.GET(req)).status, 401)
  assert.equal(reads, 2)
})
