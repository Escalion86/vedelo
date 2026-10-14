const test = require('node:test')
const assert = require('node:assert/strict')
const { loadBindings } = require('next/dist/build/swc')
const { loader, json, chain } = require('../server/stageFLoader.cjs')
test.before(() => loadBindings())
const A = 'a'.repeat(24), B = 'b'.repeat(24), E = 'e'.repeat(24), T = 'd'.repeat(24), P = 'c'.repeat(24)
function fixture({ profileId = A, profileTenant = A, missing = false, archive = false, allow = true, eventTenant = A, telegram = '@profile_fixture' } = {}) {
  const profile = { _id: profileId, tenantId: profileTenant, firstName: 'Иван', phone: 'synthetic-phone', telegram, archive, secret: 'must-not-copy' }
  const authUser = { ...profile, _id: A, tenantId: A, archive: false }
  const state = { created: null, writes: 0, queries: [] }
  const event = { _id: E, tenantId: eventTenant, eventType: 'Свадьба', servicesIds: [], contractSum: 100 }
  const template = { _id: T, tenantId: A, name: 'Шаблон', blocks: [{ id: 'intro', type: 'intro', title: '{{artist.telegram}}', text: 'Контакт {{artist.telegram}}', contentHtml: '<p>Контакт {{artist.telegram}}</p>', enabled: true }], defaults: { packages: [{ id: 'main', name: 'Основной', lines: [{ id: 'line', title: 'Работа', price: 100, quantity: 1 }] }] }, messageTemplate: 'Telegram {{artist.telegram}} {{proposal.url}}' }
  const scoped = (row, f) => row && (!f._id || String(f._id) === String(row._id)) && f.tenantId === row.tenantId ? row : null
  const load = loader({
    'next/server': { NextResponse: json },
    '@server/getTenantContext': async () => ({ user: authUser, tenantId: A }),
    '@server/dbConnect': async () => {},
    '@models/Users': { findById: () => chain(authUser) },
    '@models/MobileSessions': {},
    '@server/getAuthSecret': () => 'synthetic-auth-fixture',
    'server/mobile/tokens.js': { verifyMobileAccessToken: () => ({ sub: A, tenantId: A, sid: P }) },
    'server/mobile/sessionStore.js': { findAuthorizedMobileSession: async () => ({ _id: P }) },
    '@server/getUserTariffAccess': async id => { assert.equal(id, A); return { user: missing ? null : profile, allowProposals: allow } },
    '@models/Events': { findOne: f => { state.queries.push(f); return chain(scoped(event, f)) } },
    '@models/Clients': { findOne: f => { state.queries.push(f); return chain(null) } },
    '@models/Services': { find: f => { state.queries.push(f); return chain([]) } },
    '@models/ProposalTemplates': { findOne: f => { state.queries.push(f); return chain(scoped(template, f)) } },
    '@models/Proposals': {
      findOne: f => { state.queries.push(f); return chain(scoped(state.created, f)) },
      create: async data => { state.writes++; state.created = { ...data, _id: P, status: 'draft', save: async () => { state.writes++ } }; return state.created },
    },
  })
  const request = (body = {}, header = 'Bearer synthetic-valid') => ({ headers: new Headers(header === null ? {} : { authorization: header }), json: async () => body, nextUrl: { origin: 'https://example.invalid' } })
  const params = id => ({ params: { id } })
  return { load, request, params, state, profile }
}
for (const mode of ['mobile','web']) test(`LOG-02 ${mode}: actual auth projection -> create from template -> both previews -> publish`, async () => {
  const f = fixture(), req = body => f.request(body, mode === 'web' ? null : 'Bearer synthetic-valid')
  const context = await f.load('server/getRequestContext.js').default(req())
  if (mode === 'mobile') assert.equal(context.user.telegram, undefined, 'Mobile DTO remains minimal')
  const created = await f.load('app/api/events/[id]/proposals/route.js').POST(req({ templateId: T, artist: { telegram: '@forged' }, tenantId: B }), f.params(E))
  assert.equal(created.status, 201)
  assert.equal(f.state.created.artistSnapshot.telegram, '@profile_fixture')
  assert.equal(f.state.created.artistSnapshot.secret, undefined)
  const savedPreview = await f.load('app/api/proposals/[id]/preview/route.js').POST(req(), f.params(P))
  assert.equal(savedPreview.status, 200)
  assert.equal(savedPreview.body.data.artist.telegram, '@profile_fixture')
  assert.match(savedPreview.body.data.blocks[0].contentHtml, /@profile_fixture/)
  const templatePreview = await f.load('app/api/proposal-templates/[id]/preview/route.js').POST(req(), f.params(T))
  assert.equal(templatePreview.status, 200)
  assert.equal(templatePreview.body.data.artist.telegram, '@profile_fixture')
  assert.match(templatePreview.body.data.blocks[0].contentHtml, /@profile_fixture/)
  const published = await f.load('app/api/proposals/[id]/route.js').PATCH(req({ action: 'publish' }), f.params(P))
  assert.equal(published.status, 200)
  assert.equal(f.state.created.status, 'published')
  assert.match(published.body.data.renderedMessage, /@profile_fixture/)
  assert.ok(f.state.queries.every(q => q.tenantId === A))
})
test('LOG-02 template preview uses real mobile user projection even before creation', async () => {
  const f = fixture()
  const result = await f.load('app/api/proposal-templates/[id]/preview/route.js').POST(f.request(), f.params(T))
  assert.equal(result.status, 200); assert.equal(result.body.data.artist.telegram, '@profile_fixture'); assert.match(result.body.data.blocks[0].contentHtml, /@profile_fixture/)
})
for (const options of [{ profileId: B }, { profileTenant: B }, { missing: true }, { archive: true }])
for (const file of ['app/api/events/[id]/proposals/route.js', 'app/api/proposal-templates/[id]/preview/route.js']) test(`LOG-02 reject mismatched profile ${file} ${JSON.stringify(options)}`, async () => {
  const f = fixture(options)
  const result = await f.load(file).POST(f.request({ templateId: T }), f.params(file.includes('/events/') ? E : T))
  assert.equal(result.status, 403); assert.equal(f.state.writes, 0)
})
for (const [options, status] of [[{ allow: false },403], [{ eventTenant: B },404]]) test(`LOG-02 tariff/foreign event ${JSON.stringify(options)}`, async () => {
  const f = fixture(options); const result = await f.load('app/api/events/[id]/proposals/route.js').POST(f.request({ templateId: T }), f.params(E))
  assert.equal(result.status, status); assert.equal(f.state.writes, 0)
})
test('LOG-02 genuinely empty profile telegram remains unresolved at publication', async () => {
  const f = fixture({ telegram: '' })
  assert.equal((await f.load('app/api/events/[id]/proposals/route.js').POST(f.request({ templateId: T, telegram: '@forged' }), f.params(E))).status, 201)
  const result = await f.load('app/api/proposals/[id]/route.js').PATCH(f.request({ action: 'publish' }), f.params(P))
  assert.equal(result.status, 400); assert.equal(result.body.error.code, 'unknown_variables'); assert.equal(f.state.created.status, 'draft')
})

test('LOG-02 publication of actual mobile-created snapshot accepts filled profile variable', async () => {
  const f = fixture()
  assert.equal((await f.load('app/api/events/[id]/proposals/route.js').POST(f.request({ templateId: T }), f.params(E))).status, 201)
  const result = await f.load('app/api/proposals/[id]/route.js').PATCH(f.request({ action: 'publish' }), f.params(P))
  assert.equal(result.status, 200); assert.equal(f.state.created.status, 'published')
})
