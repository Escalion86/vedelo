const test = require('node:test')
const assert = require('node:assert/strict')
const { loadBindings } = require('next/dist/build/swc')
const { loader, json, chain } = require('./stageFLoader.cjs')
test.before(() => loadBindings())
const A = 'a'.repeat(24), B = 'b'.repeat(24), R = 'd'.repeat(24)
function fixture() {
  const calls = { cookie: 0, mobile: 0, db: 0, access: 0 }
  const model = { find: () => { calls.db++; return chain([]) }, findOne: () => { calls.db++; return chain(null) }, countDocuments: async () => 0 }
  const load = loader({
    'next/server': { NextResponse: json },
    '@server/getTenantContext': async () => { calls.cookie++; return { user: { _id: B }, tenantId: B } },
    '@server/mobile/auth': { getMobileUser: async (req) => { calls.mobile++; return req.headers.get('authorization') === 'Bearer fixture-mobile' ? { user: { _id: A, tenantId: A } } : {} } },
    '@server/getUserTariffAccess': async () => { calls.access++; return { allowClientReviews: true } },
    '@server/dbConnect': async () => {},
    ...Object.fromEntries(['ClientReviews','Users','Events','Clients'].map(n => ['@models/' + n, model])),
    '@server/reviewAppearance': { saveTenantReviewPage: async () => { calls.db++; return { appearance: {} } } },
  })
  return { load, calls }
}
const malformed = ['', 'Bearer', 'Bearer ', 'Bearer: invalid', 'Basic fixture', 'bearer fixture-mobile', 'Bearer\tfixture-mobile', 'Bearer fixture-mobile extra', 'Bearer fixture-mobile, Bearer other', 'Bearer fixture-mobile,other']
for (const header of malformed) for (const [file, method, body] of [
  ['server/clientReviews.js', 'context', {}],
  ['app/api/client-reviews/route.js', 'GET', {}],
  ['app/api/client-reviews/[id]/route.js', 'PATCH', { action: 'note', note: 'Заметка' }],
  ['app/api/client-reviews/[id]/route.js', 'PATCH', { action: 'revoke' }],
  ['app/api/site/review-page/route.js', 'POST', {}],
]) test(`SEC-01 ${method} ${body.action || ''} malformed=${JSON.stringify(header)}`, async () => {
  const f = fixture(), req = { headers: new Headers({ authorization: header, cookie: 'synthetic-cookie' }), json: async () => body, url: 'https://example.invalid/api/client-reviews' }
  const mod = f.load(file)
  const result = method === 'context' ? (await mod.reviewContext(false, req)).response : await mod[method](req, { params: { id: R } })
  assert.equal(result?.status, 401)
  assert.deepEqual(f.calls, { cookie: 0, mobile: 0, db: 0, access: 0 })
})
for (const header of [null, 'Bearer fixture-mobile', 'Bearer invalid']) test(`SEC-01 control ${header}`, async () => {
  const f = fixture(), req = { headers: new Headers(header === null ? { cookie: 'synthetic-cookie' } : { authorization: header, cookie: 'synthetic-cookie' }) }
  const result = await f.load('server/clientReviews.js').reviewContext(false, req)
  if (header === 'Bearer invalid') assert.equal(result.response.status, 401)
  else assert.equal(result.tenantId, header === null ? B : A)
  assert.equal(f.calls.cookie, header === null ? 1 : 0)
})
