const test = require('node:test')
const assert = require('node:assert/strict')
const { loadBindings } = require('next/dist/build/swc')
const { loader, chain, json } = require('./stageFLoader.cjs')

test.before(() => loadBindings())

function fixture() {
  let tenantId = 'owner', allowed = true
  const filters = []
  const proposals = [
    { _id: 'old', eventId: 'open', version: 1, status: 'expired' },
    { _id: 'latest', eventId: 'open', version: 2, status: 'published', validUntil: '2020-01-01', title: 'Предложение', publicTokenHash: 'private', clientSnapshot: { firstName: 'private' } },
    { eventId: 'live', status: 'expired' },
    { eventId: 'live', status: 'published', validUntil: '2035-01-01' },
    { eventId: 'accepted', status: 'expired', selectedPackageId: 'main' },
    ...['closed', 'canceled', 'deleted', 'foreign-event'].map(eventId => ({ eventId, status: 'expired' })),
    { eventId: 'draft', status: 'draft', validUntil: '2020-01-01' },
    { eventId: 'revoked', status: 'revoked', validUntil: '2020-01-01' },
    { eventId: 'other-tenant', status: 'expired', tenantId: 'foreign' },
  ].map(item => ({ tenantId: 'owner', ...item }))
  const events = ['open', 'live', 'accepted', 'closed', 'canceled', 'draft', 'revoked', 'other-tenant', 'foreign-event'].map(_id => ({
    _id, tenantId: _id === 'foreign-event' ? 'foreign' : 'owner',
    status: ['closed', 'canceled'].includes(_id) ? _id : 'draft',
    eventType: 'Детский праздник', eventDate: '2030-01-01',
  }))
  const mocks = {
    'next/server': { NextResponse: json },
    '@server/dbConnect': async () => {},
    '@server/proposalRequestContext': async () => ({ tenantId, user: tenantId ? { _id: tenantId } : null }),
    '@server/getUserTariffAccess': async () => ({ allowProposals: allowed }),
    '@models/Proposals': { find(filter) {
      filters.push(['proposals', filter])
      return chain(proposals.filter(p => p.tenantId === filter.tenantId && filter.status.$in.includes(p.status)).sort((a, b) => (b.version || 0) - (a.version || 0)))
    } },
    '@models/Events': { find(filter) {
      filters.push(['events', filter])
      return chain(events.filter(e => e.tenantId === filter.tenantId && filter._id.$in.includes(e._id) && filter.status.$in.includes(e.status)))
    } },
  }
  return { GET: loader(mocks)('app/api/proposals/expired/route.js').GET, filters,
    setTenant(value) { tenantId = value }, setAllowed(value) { allowed = value } }
}

test('attention expiry is tenant-scoped, deduplicated, excludes fulfilled works and current/accepted versions', async () => {
  const f = fixture()
  const result = await f.GET({})
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.data.map(p => p._id), ['latest'])
  assert.equal(result.body.data[0].eventId, 'open')
  assert.equal(result.body.data[0].eventType, 'Детский праздник')
  assert.equal(result.headers['Cache-Control'], 'private, no-store')
  assert.equal(result.body.data[0].publicTokenHash, undefined)
  assert.equal(result.body.data[0].clientSnapshot, undefined)
  assert.equal(f.filters.length, 2)
  for (const [, filter] of f.filters) assert.equal(filter.tenantId, 'owner')
  f.setTenant('foreign')
  assert.deepEqual((await f.GET({})).body.data, [])
})

test('attention expiry rejects unauthorized and unavailable tariff before database reads', async () => {
  const f = fixture()
  f.setTenant(null)
  assert.equal((await f.GET({})).status, 401)
  f.setTenant('owner')
  f.setAllowed(false)
  assert.equal((await f.GET({})).status, 403)
  assert.equal(f.filters.length, 0)
})
