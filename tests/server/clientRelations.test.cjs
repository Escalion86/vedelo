const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const clientId = '65b100000000000000000001'
const tenantId = '65b100000000000000000002'
const foreignTenant = '65b100000000000000000003'
const eventId = '65b100000000000000000004'

test.before(() => loadBindings())

const loadRoute = ({ context, clientExists, events = [], transactions = [] }) => {
  const reads = []
  const model = (name, data) => ({
    find: (filter) => ({
      sort: (sort) => ({
        lean: async () => {
          reads.push({ name, filter, sort })
          return data
        },
      }),
    }),
  })
  const mocks = {
    '@server/dbConnect': async () => {},
    '@server/getRequestContext': async () => context,
    '@models/Clients': {
      exists: async (filter) => {
        reads.push({ name: 'clients', filter })
        return clientExists
      },
    },
    '@models/Events': model('events', events),
    '@models/Transactions': model('transactions', transactions),
  }
  const file = 'app/api/clients/[id]/relations/route.js'
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => mocks[name] ?? require(name), mod, mod.exports
  )
  const get = (id = clientId) => mod.exports.GET(
    new Request(`http://localhost/api/clients/${id}/relations?tenantId=${tenantId}`),
    { params: Promise.resolve({ id }) }
  )
  return { get, reads }
}

test('relations assemble primary and additional work with direct and linked transactions in the authenticated tenant', async () => {
  const events = [{ _id: eventId, otherContacts: [{ clientId }] }]
  const transactions = [{ _id: 'direct', clientId }, { _id: 'linked', eventId }]
  const { get, reads } = loadRoute({ context: { tenantId }, clientExists: true, events, transactions })
  const response = await get()

  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data, { events, transactions })
  assert.deepEqual(reads, [
    { name: 'clients', filter: { _id: clientId, tenantId } },
    {
      name: 'events',
      filter: { tenantId, $or: [{ clientId }, { 'otherContacts.clientId': clientId }] },
      sort: { eventDate: -1, createdAt: -1 },
    },
    {
      name: 'transactions',
      filter: { tenantId, $or: [{ clientId }, { eventId: { $in: [eventId] } }] },
      sort: { date: -1, createdAt: -1 },
    },
  ])
})

test('relations require authentication and reject a foreign or invalid client ID before reading work and money', async () => {
  const anonymous = loadRoute({ context: {} })
  assert.equal((await anonymous.get()).status, 401)
  assert.deepEqual(anonymous.reads, [])

  const foreign = loadRoute({ context: { tenantId: foreignTenant }, clientExists: false })
  const response = await foreign.get()
  assert.equal(response.status, 404)
  assert.equal((await response.json()).data, undefined)
  assert.deepEqual(foreign.reads, [
    { name: 'clients', filter: { _id: clientId, tenantId: foreignTenant } },
  ])

  const invalid = loadRoute({ context: { tenantId } })
  assert.equal((await invalid.get('invalid-id')).status, 404)
  assert.deepEqual(invalid.reads, [])
})
