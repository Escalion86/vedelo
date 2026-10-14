// Real source loader + localhost HTTP transport. No auth/handler/DTO mocks.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const net = require('node:net')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const assert = require('node:assert/strict')
globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage
const { workUnitAsyncStorage } = require('next/dist/server/app-render/work-unit-async-storage.external')
const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external')
const { RequestCookies } = require('next/dist/compiled/@edge-runtime/cookies')
const { encode } = require('next-auth/jwt')
const mongoose = require('mongoose')
const { createLoader } = require('../../../tests/server/loadWithAliases.cjs')
const scratch = '/home/aleksei/.hermes/cache/scratch/vedelo-t-20261012'
const reports = '/home/aleksei/reports/vedelo/2026-10-11/update/T-api-lock-retry'
const freePort = () => new Promise((resolve) => {
  const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
})
const open = (port) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); resolve(true) }); s.once('error', () => resolve(false))
})
const routes = [
  ['proposal-templates/defaults', 'app/api/proposal-templates/defaults/route.js'],
  ['proposal-templates/([^/]+)/preview', 'app/api/proposal-templates/[id]/preview/route.js'],
  ['proposals/([^/]+)/preview', 'app/api/proposals/[id]/preview/route.js'],
  ['proposal-templates', 'app/api/proposal-templates/route.js'],
  ['proposal-templates/([^/]+)', 'app/api/proposal-templates/[id]/route.js'],
  ['events/([^/]+)/proposals', 'app/api/events/[id]/proposals/route.js'],
  ['proposals/statuses', 'app/api/proposals/statuses/route.js'],
  ['proposals/([^/]+)/logo', 'app/api/proposals/[id]/logo/route.js'],
  ['proposals/([^/]+)/send-telegram', 'app/api/proposals/[id]/send-telegram/route.js'],
  ['proposals/([^/]+)', 'app/api/proposals/[id]/route.js'],
  ['client-reviews/statuses', 'app/api/client-reviews/statuses/route.js'],
  ['client-reviews', 'app/api/client-reviews/route.js'],
  ['client-reviews/([^/]+)', 'app/api/client-reviews/[id]/route.js'],
  ['site/review-page/logo', 'app/api/site/review-page/logo/route.js'],
  ['site/review-page', 'app/api/site/review-page/route.js'],
  ['escalioncloud', 'app/api/escalioncloud/route.js'],
  ['mobile/v1/billing', 'app/api/mobile/v1/billing/route.js'],
  ['mobile/v1/statistics', 'app/api/mobile/v1/statistics/route.js'],
  ['mobile/v1/events/([^/]+)', 'app/api/mobile/v1/events/[id]/route.js'],
  ['services', 'app/api/services/route.js'],
]
async function fixture(run) {
  const mongoPort = await freePort(); assert.notEqual(mongoPort, 27017)
  const dir = fs.mkdtempSync(path.join(scratch, 'mongo/db-'))
  const mongoLog = fs.openSync(path.join(dir, 'mongod.log'), 'wx')
  const mongo = spawn(path.join(scratch, 'mongo/mongod'), ['--dbpath', dir, '--port', String(mongoPort), '--bind_ip', '127.0.0.1', '--nounixsocket'], { stdio: ['ignore', mongoLog, mongoLog] })
  fs.closeSync(mongoLog)
  let app, cloud, db; const nativeFetch = global.fetch
  const cloudCalls = [], telegramCalls = []; let failMedia = true
  const teardown = async () => {
    global.fetch = nativeFetch
    for (const s of [app, cloud]) if (s) { s.closeAllConnections(); await new Promise((resolve) => s.close(resolve)) }
    await mongoose.disconnect()
    if (db) await db.close()
    if (mongo.exitCode === null) { const exited = once(mongo, 'exit'); mongo.kill('SIGTERM'); await exited }
    const ports = [mongoPort, app?.fixturePort, cloud?.fixturePort].filter(Boolean)
    for (const p of ports) assert.equal(await open(p), false, `Port ${p} closed`)
    assert.throws(() => process.kill(mongo.pid, 0), /ESRCH/)
    fs.writeFileSync(path.join(reports, `AUTHOR-${run}-teardown.json`), JSON.stringify({ mongoPID: mongo.pid, ports, closed: true, mongoExit: mongo.exitCode, mongoSignal: mongo.signalCode }), { flag: 'wx' })
  }
  try {
    for (let i = 0; !(await open(mongoPort)); i++) { assert.equal(mongo.exitCode, null); assert.ok(i < 200); await new Promise((r) => setTimeout(r, 100)) }
    const uri = `mongodb://127.0.0.1:${mongoPort}/author_t`
    process.env.MONGODB_URI = uri; process.env.MONGODB_DBNAME = 'author_t'
    process.env.NEXTAUTH_SECRET = 'synthetic-author-t-local-secret'
    process.env.NEXTAUTH_URL = 'http://127.0.0.1:39999'
    process.env.DOMAIN = process.env.NEXTAUTH_URL
    process.env.ESCALIONCLOUD_PASSWORD = 'synthetic-local-cloud'
    cloud = http.createServer(async (req, res) => {
      const chunks = []; for await (const c of req) chunks.push(c)
      const request = new Request(`http://127.0.0.1${req.url}`, { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) })
      const form = await request.formData(); const directory = form.get('directory')
      const files = form.getAll('files'); assert.equal(req.headers['x-api-password'], 'synthetic-local-cloud')
      cloudCalls.push({ directory, files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })) })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(files.map((file) => ({ url: `https://cloud.escalion.ru/uploads/${directory}/${file.name}` }))))
    })
    await new Promise((r) => cloud.listen(0, '127.0.0.1', r)); cloud.fixturePort = cloud.address().port
    process.env.ESCALIONCLOUD_API_URL = `http://127.0.0.1:${cloud.fixturePort}`
    global.fetch = (url, options) => { assert.equal(new URL(String(url)).hostname, '127.0.0.1', 'No remote fetch'); return nativeFetch(url, options) }
    // Only the actual Telegram HTTP transport is replaced; business functions run.
    const undici = require('undici')
    const loader = await createLoader({ undici: { ...undici, fetch: async (url, options) => {
      assert.equal(new URL(url).hostname, 'api.telegram.org')
      const body = JSON.parse(options.body); const method = new URL(url).pathname.split('/').pop()
      telegramCalls.push({ method, body })
      const failing = failMedia && method !== 'sendMessage'
      const message = { message_id: telegramCalls.length, date: Math.floor(Date.now()/1000), chat: { id: 777, type: 'private' }, text: body.text || '', business_connection_id: 'fixture-business' }
      return new Response(JSON.stringify(failing ? { ok: false, description: 'synthetic media failure' } : { ok: true, result: method === 'sendMediaGroup' ? [message, { ...message, message_id: message.message_id + 1 }] : message }), { status: failing ? 400 : 200, headers: { 'content-type': 'application/json' } })
    } } })
    db = await mongoose.createConnection(uri).asPromise()
    const model = (name) => loader.load(`models/${name}.js`).default
    await loader.load('server/dbConnect.js').default()
    const tariff = await model('Tariffs').create({ title: 'Synthetic T', price: 100, eventsPerMonth: 100, allowProposals: true, allowDocuments: true, allowClientReviews: true, allowStatistics: true, allowTelegramIntegration: true, allowAi: true, aiIncludedRubPerMonth: 123, allowCalendarSync: true, allowTelephony: true, allowPublicLeadApi: true })
    const user = await model('Users').create({ firstName: 'Synthetic artist', secondName: 'Fixture', phone: '79000000000', telegram: 'fixture_artist', tariffId: tariff._id, tariffActiveUntil: new Date(Date.now()+86400000*30) })
    await model('Users').updateOne({ _id: user._id }, { $set: { tenantId: user._id } }); user.tenantId = user._id
    const foreign = await model('Users').create({ firstName: 'Foreign synthetic', tariffId: tariff._id, tariffActiveUntil: user.tariffActiveUntil })
    const client = await model('Clients').create({ tenantId: user._id, firstName: 'Synthetic client' })
    const service = await model('Services').create({ tenantId: user._id, title: 'Synthetic service', price: 700 })
    const event = await model('Events').create({ tenantId: user._id, clientId: client._id, servicesIds: [service._id], status: 'active', eventDate: new Date('2026-11-01T12:00:00Z'), isTransferred: true, address: { town: 'FixtureTown' } })
    const closed = await model('Events').create({ tenantId: user._id, clientId: client._id, status: 'closed', eventDate: new Date('2026-10-01T12:00:00Z') })
    const otherEvent = await model('Events').create({ tenantId: foreign._id, status: 'draft' })
    const template = await model('ProposalTemplates').create({ tenantId: user._id, name: 'Synthetic template', blocks: [], defaults: {} })
    const packages = [{ id: 'main', title: 'Main', lines: [{ serviceId: String(service._id), title: 'Synthetic service', price: 700 }], total: 700, manualTotal: true }]
    const proposal = await model('Proposals').create({ tenantId: user._id, eventId: event._id, clientId: client._id, title: 'Synthetic proposal', packages, artistSnapshot: { firstName: user.firstName }, clientSnapshot: { firstName: client.firstName } })
    const foreignProposal = await model('Proposals').create({ tenantId: foreign._id, eventId: otherEvent._id, title: 'Foreign proposal' })
    const foreignTemplate = await model('ProposalTemplates').create({ tenantId: foreign._id, name: 'Foreign template' })
    const session = await model('MobileSessions').create({ userId: user._id, tenantId: user._id, refreshTokenHash: 'synthetic-hash', expiresAt: new Date(Date.now()+86400000) })
    const tokens = loader.load('server/mobile/tokens.js')
    const v1 = tokens.createMobileAccessToken({ user, tenantId: user._id, sessionId: session._id }).token
    const h = Buffer.from('{}').toString('base64url'), b = Buffer.from(JSON.stringify({ uid: String(user._id), exp: Date.now()+86400000 })).toString('base64url')
    const legacy = `${h}.${b}.${crypto.createHmac('sha256', process.env.NEXTAUTH_SECRET).update(`${h}.${b}`).digest('hex')}`
    const cookie = await encode({ secret: process.env.NEXTAUTH_SECRET, token: { userId: String(user._id), tenantId: String(user._id), phone: user.phone, role: 'user' } })
    const credentials = { old: { authorization: `Bearer ${legacy}` }, new: { authorization: `Bearer ${v1}` }, web: { cookie: `next-auth.session-token=${cookie}` } }
    app = http.createServer(async (incoming, outgoing) => {
      try {
        const url = `http://127.0.0.1:${app.fixturePort}${incoming.url}`
        const chunks = []; for await (const c of incoming) chunks.push(c)
        const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) })
        request.nextUrl = new URL(url)
        const pathname = new URL(url).pathname.replace(/^\/api\//, '')
        let response = new Response('{}', { status: 404 })
        for (const [pattern, file] of routes) {
          const match = pathname.match(new RegExp(`^${pattern}$`))
          if (!match || !fs.existsSync(file)) continue
          const handler = loader.load(file)[incoming.method]
          response = handler ? await workAsyncStorage.run({ route: pathname, isStaticGeneration: false }, () => workUnitAsyncStorage.run({ type: 'request', phase: 'render', headers: request.headers, cookies: new RequestCookies(request.headers) }, () => handler(request, { params: Promise.resolve({ id: match[1] }) }))) : new Response('{}', { status: 405 })
          break
        }
        outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()))
      } catch (e) { console.error(e.stack); outgoing.writeHead(500); outgoing.end(JSON.stringify({ fixtureError: e.message })) }
    })
    await new Promise((r) => app.listen(0, '127.0.0.1', r)); app.fixturePort = app.address().port
    const request = async (identity, url, method = 'GET', body, extra = {}) => {
      const response = await fetch(`http://127.0.0.1:${app.fixturePort}/api${url}`, { method, headers: { ...credentials[identity], ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...extra }, ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) })
      const data = await response.json(); assert.equal(data.fixtureError, undefined, 'Fixture/production import error')
      return { status: response.status, body: data }
    }
    return { request, model, db, user, foreign, tariff, client, service, event, closed, otherEvent, template, proposal, foreignProposal, foreignTemplate, packages, session, cloudCalls, telegramCalls, allowMedia: () => { failMedia = false }, denyMedia: () => { failMedia = true }, teardown }
  } catch (e) { await teardown(); throw e }
}
module.exports = { fixture, reports }
