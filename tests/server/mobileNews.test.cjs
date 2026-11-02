const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net')
const { spawn } = require('node:child_process'), { once } = require('node:events')
const mongoose = require('mongoose'), { NextResponse } = require('next/server')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const load = (file, mocks) => {
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), { filename: file, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' } })
  const result = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => { assert.ok(id in mocks, id); return mocks[id] }, result, result.exports)
  return result.exports
}
test('published mobile news and shared seen marker: real Mongo, tenant/user isolation', { skip: !process.env.NEWS_TEST_MONGOD, timeout: 60000 }, async t => {
  await loadBindings()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedelo-news-'))
  const probe = net.createServer(); await new Promise(done => probe.listen(0, '127.0.0.1', done)); const port = probe.address().port; await new Promise(done => probe.close(done))
  const process = spawn(require('node:process').env.NEWS_TEST_MONGOD, ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet'], { stdio: 'ignore', windowsHide: true }), exited = once(process, 'exit')
  try {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/news_test`, { serverSelectionTimeoutMS: 30000 })
    const O = mongoose.Schema.Types.ObjectId
    const Users = mongoose.model('NewsTestUsers', new mongoose.Schema({ tenantId: O, archive: Boolean, lastSeenNewsAt: Date }))
    const News = mongoose.model('NewsTestNews', new mongoose.Schema({ title: String, version: String, publishedAt: Date, createdAt: Date, isPublished: Boolean, contentHtml: String, items: [String], createdBy: O }))
    const [a, b, colleague] = Array.from({ length: 3 }, () => new mongoose.Types.ObjectId())
    await Users.create([{ _id: a, tenantId: a }, { _id: b, tenantId: b }, { _id: colleague, tenantId: a }])
    await News.create([{ title: 'Published', isPublished: true, publishedAt: new Date('2026-01-01'), contentHtml: '<p>Text<img src="https://example.test/image.jpg" onerror="alert(1)"><script>alert(1)</script></p>', createdBy: a }, { title: 'Draft secret', isPublished: false }, { title: 'Legacy', isPublished: true, publishedAt: new Date('2025-12-01'), items: ['First <item>'] }])
    const helpers = await import('../../helpers/newsRichText.mjs')
    const reader = load('server/newsReader.js', { '@models/News': News, '@models/Users': Users, '@helpers/newsRichText.mjs': helpers })
    let context = { user: { _id: a, role: 'dev' }, tenantId: a }
    const mocks = { 'next/server': { NextResponse }, '@server/dbConnect': async () => {}, '@server/getRequestContext': async () => context, '@server/newsReader': reader, '@server/mobile/routeHelpers': load('server/mobile/routeHelpers.js', { 'next/server': { NextResponse } }) }
    const get = load('app/api/mobile/v1/news/route.js', mocks).GET, mark = load('app/api/news/seen/route.js', mocks).POST
    const req = body => ({ url: 'https://vedelo.test/api/mobile/v1/news?all=1', json: async () => body })
    await t.test('mobile is published-only for every role, sanitized rich content and legacy bullets', async () => {
      const result = await (await get(req())).json()
      assert.deepEqual(result.data.items.map(row => row.title), ['Published', 'Legacy'])
      assert.equal(result.data.lastSeenNewsAt, null)
      assert.ok(!JSON.stringify(result).includes('createdBy')); assert.ok(!JSON.stringify(result).includes('Draft secret'))
      assert.ok(!result.data.items[0].contentHtml.includes('onerror')); assert.ok(!result.data.items[0].contentHtml.includes('<script'))
      assert.ok(result.data.items[0].contentHtml.includes('https://example.test/image.jpg'))
      assert.ok(result.data.items[1].contentHtml.includes('&lt;item&gt;'))
    })
    await t.test('PWA and APK share a monotonic personal marker, not another tenant or colleague', async () => {
      const dates = ['2026-01-02', '2026-01-01', '2026-01-03']
      await Promise.all(dates.map(seenAt => mark(req({ seenAt }))))
      assert.equal((await (await get(req())).json()).data.lastSeenNewsAt, '2026-01-03T00:00:00.000Z')
      const old = await (await mark(req({ seenAt: '2025-12-01' }))).json()
      assert.equal(old.data.lastSeenNewsAt, '2026-01-03T00:00:00.000Z')
      for (const identity of [{ user: { _id: b }, tenantId: b }, { user: { _id: colleague }, tenantId: a }]) {
        context = identity; assert.equal((await (await get(req())).json()).data.lastSeenNewsAt, null)
      }
      context = { user: { _id: a }, tenantId: a }
      assert.equal((await mark(req({ seenAt: '2026-01-04', tenantId: b }))).status, 400)
      const capped = await reader.markUserNewsSeen(context, { seenAt: '2099-01-01' }, new Date('2026-01-04'))
      assert.equal(capped.lastSeenNewsAt.toISOString(), '2026-01-04T00:00:00.000Z')
    })
    await t.test('wrong tenant, revoked and archived users cannot read or mark; legacy owner is scoped', async () => {
      for (const identity of [{ user: { _id: a }, tenantId: b }, {}]) {
        context = identity; assert.equal((await get(req())).status, 401); assert.equal((await mark(req({ seenAt: '2026-01-05' }))).status, 401)
      }
      context = { user: { _id: a }, tenantId: a }; await Users.updateOne({ _id: a, tenantId: a }, { $unset: { tenantId: 1 } })
      assert.equal((await get(req())).status, 200)
      await Users.updateOne({ _id: a, tenantId: null }, { $set: { archive: true } })
      assert.equal((await get(req())).status, 401); assert.equal((await mark(req({ seenAt: '2026-01-05' }))).status, 401)
    })
  } finally {
    await mongoose.disconnect(); process.kill(); await exited.catch(() => {})
    const resolved = path.resolve(dir)
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('vedelo-news-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  }
})
