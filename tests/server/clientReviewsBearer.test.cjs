const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const crypto = require('node:crypto')
const mongoose = require('mongoose')
const helper = () => import('../../helpers/clientReviews.mjs')
function load(file, mocks) {
  const { code } = transformSync(readFileSync(file, 'utf8'), { filename: file, jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((name) => {
    if (!(name in mocks)) throw new Error(`Не задана тестовая зависимость: ${name}`)
    return mocks[name]
  }, module, module.exports)
  return module.exports
}
const A = 'aaaaaaaaaaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const E = 'eeeeeeeeeeeeeeeeeeeeeeee', C = 'cccccccccccccccccccccccc', R = 'dddddddddddddddddddddddd'
const json = { json: (body, options = {}) => ({ status: options.status || 200, body, headers: options.headers }) }
const chain = (value) => ({ select() { return this }, sort() { return this }, skip() { return this }, limit() { return this }, lean: async () => value })
function harness() {
  const state = { allowed: true, cookieCalls: 0, queries: [], writes: [], rows: [], settings: {} }
  const cookie = async () => { state.cookieCalls++; return { user: { _id: B, tenantId: B }, tenantId: B } }
  const requestContext = load('server/getRequestContext.js', {
    '@server/getTenantContext': cookie,
    '@server/mobile/auth': { getMobileUser: async (req) => req.headers.get('authorization') === 'Bearer fixture-mobile' ? { user: { _id: A, tenantId: A }, sessionId: 'фикстура' } : { error: 'Не авторизован' } },
  }).default
  const access = async () => ({ allowClientReviews: state.allowed })
  const reviews = {
    find: (filter) => { state.queries.push(filter); return chain(state.rows.filter((row) => row.tenantId === filter.tenantId)) },
    countDocuments: async (filter) => { state.queries.push(filter); return state.rows.filter((row) => row.tenantId === filter.tenantId).length },
    findOne: (filter) => { state.queries.push(filter); return chain(state.rows.find((row) => row._id === filter._id && row.tenantId === filter.tenantId) || null) },
    findOneAndUpdate: (filter, update) => { state.writes.push(filter); const row = state.rows.find((row) => row._id === filter._id && row.tenantId === filter.tenantId); if (row) Object.assign(row, update.$set); return chain(row || null) },
  }
  const entities = { find: (filter) => { state.queries.push(filter); return chain([]) }, findOne: (filter) => { state.queries.push(filter); return chain(null) } }
  const mocks = { crypto, mongoose, 'next/server': { NextResponse: json }, '@models/ClientReviews': reviews, '@models/Events': entities, '@models/Clients': entities, '@models/Users': entities, '@server/dbConnect': async () => {}, '@server/getTenantContext': cookie, '@server/getRequestContext': requestContext, '@server/getUserTariffAccess': access }
  return { state, mocks, reviews, entities, requestContext, access }
}
const request = (method, path, token = 'fixture-mobile', body = {}) => ({ method, url: `http://127.0.0.1${path}`, headers: new Headers(token === null ? {} : { authorization: `Bearer ${token}`, cookie: 'fixture-web' }), json: async () => body, formData: async () => new FormData() })

test('Приватный контекст: mobile Bearer, invalid Bearer без cookie fallback, старый web вызов', async () => {
  await loadBindings()
  const h = harness(), ctx = load('server/clientReviews.js', { ...h.mocks, '@helpers/clientReviews.mjs': await helper() })
  assert.equal((await ctx.reviewContext(false, request('GET', '/'))).tenantId, A)
  assert.equal(h.state.cookieCalls, 0)
  assert.equal((await ctx.reviewContext(false, request('GET', '/', 'invalid'))).response.status, 401)
  assert.equal(h.state.cookieCalls, 0)
  for (const header of ['Bearer','bearer invalid','BEARER invalid']) {
    const req=request('GET','/');req.headers.set('authorization',header)
    assert.equal((await ctx.reviewContext(false,req)).response?.status,401)
  }
  assert.equal(h.state.cookieCalls, 0)
  assert.equal((await ctx.reviewContext()).tenantId, B)
  h.state.allowed = false
  assert.equal((await ctx.reviewContext(true, request('GET', '/'))).response.status, 403)
  assert.equal((await ctx.reviewContext(false, request('GET', '/'))).tenantId, A)
})

test('Все приватные HTTP-методы передают req: Bearer/invalid Bearer/tenant/тариф', async (t) => {
  await loadBindings()
  const h = harness(), ctx = load('server/clientReviews.js', { ...h.mocks, '@helpers/clientReviews.mjs': await helper() })
  const base = { ...h.mocks, '@server/clientReviews': ctx, '@helpers/clientReviews.mjs': await helper(), '@helpers/getPersonFullName': () => 'Исполнитель', '@server/reviewAppearance': {
    getTenantReviewPage: async (tenant) => { h.state.queries.push({ tenantId: tenant }); return { publicName: 'Публичное имя' } },
    saveTenantReviewPage: async (tenant, input) => { h.state.writes.push({ tenantId: tenant }); return { appearance: { publicName: input.publicName } } },
  }, '@server/escalionCloud': { uploadFilesToEscalionCloud: async () => { throw new Error('Облако не используется') } }, sharp: () => { throw new Error('Невалидное изображение') }, 'node:crypto': crypto, '@helpers/reviewAppearance.mjs': await import('../../helpers/reviewAppearance.mjs') }
  const specs = [
    ['app/api/client-reviews/route.js', 'GET', '/api/client-reviews', {}, false, 200],
    ['app/api/client-reviews/route.js', 'POST', '/api/client-reviews', { eventId: E, tenantId: B }, true, 404],
    ['app/api/client-reviews/statuses/route.js', 'GET', '/api/client-reviews/statuses', {}, false, 200],
    ...['link','renew','sent','revoke','read','note'].map((action) => ['app/api/client-reviews/[id]/route.js', 'PATCH', `/api/client-reviews/${R}`, { action, note: 'Заметка', tenantId: B }, ['link','renew','sent'].includes(action), 404]),
    ['app/api/site/review-page/route.js', 'GET', '/api/site/review-page', {}, false, 200],
    ['app/api/site/review-page/route.js', 'POST', '/api/site/review-page', { publicName: 'Имя', tenantId: B }, true, 200],
    ['app/api/site/review-page/logo/route.js', 'POST', '/api/site/review-page/logo', {}, true, 400],
  ]
  for (const [file, method, path, body, gated, status] of specs) await t.test(`${method} ${path} ${body.action || ''}`, async () => {
    const route = load(file, base)[method]
    h.state.queries = []; h.state.writes = []; h.state.allowed = true
    const ok = await route(request(method, path, 'fixture-mobile', body), { params: Promise.resolve({ id: R }) })
    assert.equal(ok.status, status)
    for (const filter of [...h.state.queries, ...h.state.writes]) assert.equal(filter.tenantId, A)
    const before = h.state.queries.length + h.state.writes.length
    assert.equal((await route(request(method, path, 'invalid', body), { params: { id: R } })).status, 401)
    assert.equal(h.state.queries.length + h.state.writes.length, before)
    h.state.allowed = false
    assert.equal((await route(request(method, path, 'fixture-mobile', body), { params: { id: R } })).status, gated ? 403 : status)
  })
  assert.equal(h.state.cookieCalls, 0)
})

test('Чужой отзыв невидим, note/read/revoke доступны без тарифной опции; секрет не попадает в DTO', async () => {
  await loadBindings()
  const h = harness(), ctx = load('server/clientReviews.js', { ...h.mocks, '@helpers/clientReviews.mjs': await helper() })
  const route = load('app/api/client-reviews/[id]/route.js', { '@models/ClientReviews': h.reviews, '@server/clientReviews': ctx, '@helpers/clientReviews.mjs': await helper() }).PATCH
  h.state.allowed = false
  h.state.rows = [{ _id: R, tenantId: B, eventId: E, clientId: C, nonce: 'скрытый' }]
  assert.equal((await route(request('PATCH','/','invalid',{action:'note',note:'Заметка'}),{params:{id:R}})).status,401)
  assert.equal((await route(request('PATCH','/','fixture-mobile',{action:'note',note:'Заметка'}),{params:{id:R}})).status,404)
  h.state.rows[0].tenantId = A; h.state.rows[0].submittedAt = new Date()
  for (const action of ['note','read']) {
    const response = await route(request('PATCH','/','fixture-mobile',{action,note:'  Заметка  '}),{params:{id:R}})
    assert.equal(response.status,200); assert.equal(response.body.data.nonce,undefined); assert.equal(response.body.data.url,undefined)
  }
  assert.equal(h.state.rows[0].note,'Заметка'); assert.ok(h.state.rows[0].readAt)
  h.state.rows[0].submittedAt=null
  assert.equal((await route(request('PATCH','/','fixture-mobile',{action:'revoke'}),{params:{id:R}})).status,200)
  assert.ok(h.state.rows[0].revokedAt)
})

test('Настройки и upload сохраняют совместимый строковый error для web-клиента', async () => {
  await loadBindings()
  const h = harness(), ctx = load('server/clientReviews.js', { ...h.mocks, '@helpers/clientReviews.mjs': await helper() })
  const base = { ...h.mocks, '@server/clientReviews': ctx, '@server/reviewAppearance': { getTenantReviewPage: async()=>({}),saveTenantReviewPage:async()=>({}) }, '@server/escalionCloud':{uploadFilesToEscalionCloud:async()=>[]}, sharp:()=>{},'node:crypto':crypto,'@helpers/reviewAppearance.mjs':await import('../../helpers/reviewAppearance.mjs') }
  for (const file of ['app/api/site/review-page/route.js','app/api/site/review-page/logo/route.js']) {
    const route = load(file,base)
    for (const method of Object.keys(route).filter(method=>['GET','POST'].includes(method))) {
      const response = await route[method](request(method,'/','invalid'))
      assert.equal(response.status,401)
      assert.equal(typeof response.body.error,'string')
    }
  }
})
