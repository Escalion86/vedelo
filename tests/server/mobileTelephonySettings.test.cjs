const test = require('node:test')
const assert = require('node:assert/strict')
const { loadBindings } = require('next/dist/build/swc')
const { loader, json, chain } = require('./stageFLoader.cjs')
test.before(() => loadBindings())

function fixture() {
  const tenantId = 'a'.repeat(24)
  const custom = { novofonEnabled: true, novofonWebhookSecret: 'synthetic-webhook', novofonApiKey: 'synthetic-key', untouched: true }
  const writes = []
  const state = { authorized: true, allowed: true, race: false }
  const mocks = {
    'next/server': { NextResponse: json },
    '@server/getRequestContext': async () => state.authorized ? { tenantId, user: { _id: tenantId } } : {},
    '@server/getUserTariffAccess': async () => ({}),
    '@server/integrationAccess': { hasIntegrationAccess: () => state.allowed },
    '@server/dbConnect': async () => {},
    '@models/SiteSettings': {
      findOne(filter) { assert.deepEqual(filter, { tenantId }); return chain({ custom: { ...custom } }) },
      async updateOne(filter, update) {
        writes.push({ filter, update })
        assert.deepEqual(filter, { tenantId, 'custom.novofonWebhookSecret': 'synthetic-webhook' })
        if (state.race) { delete custom.novofonWebhookSecret; custom.novofonEnabled = false; return { matchedCount: 0 } }
        custom.novofonEnabled = update.$set['custom.novofonEnabled']
        return { matchedCount: 1 }
      },
    },
    '@models/Users': { findById: () => chain({ role: 'user' }) },
    '@server/avito': {}, '@server/vkGroup': {}, '@server/publicLeadService': {},
  }
  for (const provider of ['avito', 'vk']) for (const action of ['connect', 'status'])
    mocks[`app/api/integrations/${provider}/${action}/route.js`] = { POST: () => { throw Error('unexpected provider call') } }
  const route = loader(mocks)('app/api/mobile/v1/integrations/[provider]/route.js')
  return { custom, writes, state, patch: body => route.PATCH({ clone: () => ({ json: async () => body }) }, { params: { provider: 'telephony' } }) }
}

test('pause/resume only changes the own tenant enabled flag and never rotates/exposes credentials', async () => {
  const f = fixture()
  for (const enabled of [false, false, true]) {
    const response = await f.patch({ enabled })
    assert.equal(response.status, 200)
    assert.equal(response.body.data.enabled, enabled)
    assert.equal(response.body.data.configured, true)
    assert.equal(response.body.data.hasApiKey, true)
    assert.ok(!JSON.stringify(response.body).includes('synthetic-'))
  }
  assert.equal(f.custom.novofonWebhookSecret, 'synthetic-webhook')
  assert.equal(f.custom.novofonApiKey, 'synthetic-key')
  assert.equal(f.custom.untouched, true)
  assert.ok(f.writes.every(({ update }) => Object.keys(update.$set).join() === 'custom.novofonEnabled'))
})
test('tenant/user/credential injection, missing boolean and tariff/auth failures never write', async () => {
  const f = fixture()
  for (const body of [{ enabled: false, tenantId: 'b'.repeat(24) }, { enabled: false, userId: 'b'.repeat(24) }, { apiKey: 'bad' }, { enabled: 'false' }, {}, null, []])
    assert.equal((await f.patch(body)).status, 400)
  f.state.allowed = false
  assert.equal((await f.patch({ enabled: false })).status, 403)
  f.state.authorized = false
  assert.equal((await f.patch({ enabled: false })).status, 401)
  assert.equal(f.writes.length, 0)
})
test('a concurrent disconnect cannot be undone by resume and unconfigured integration is not recreated', async () => {
  const f = fixture()
  f.state.race = true
  assert.equal((await f.patch({ enabled: true })).status, 409)
  assert.equal(f.custom.novofonEnabled, false)
  assert.equal((await f.patch({ enabled: true })).status, 409)
  assert.equal(f.writes.length, 1)
})
