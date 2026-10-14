const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { fixture, reports } = require('./apiCycleFixture.cjs')
const run = process.env.AUTHOR_RUN || 'billing-post'
test('billing POST preserves purchase/readback and additive DTO for every client', { timeout: 180000 }, async (t) => {
  const paths = ['app/api/mobile/v1/billing/route.js', 'server/mobile/billing.js', 'server/billing.js', 'server/mobile/tests/billingPost.test.cjs', 'server/mobile/tests/apiCycleFixture.cjs', 'package.json', 'package-lock.json']
  fs.writeFileSync(`${reports}/AUTHOR-${run}-actual-source.json`, JSON.stringify({ sourceSHA: Object.fromEntries(paths.map((p) => [p, crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])), startedAt: new Date().toISOString() }), { flag: 'wx' })
  const f = await fixture(run), cells = []
  try {
    for (const client of ['old', 'new', 'web']) await t.test(`${client}: real billing POST and GET exact tariff/rates readback`, async () => {
      const row = { client, testcase: `${client}: real billing POST and GET exact tariff/rates readback`, command: `AUTHOR-${run}`, status: 'executed' }
      cells.push(row)
      try {
        await f.model('Users').updateOne({ _id: f.user._id }, { $set: { balance: 1000 } })
        const target = await f.model('Tariffs').create({ title: `Synthetic purchase ${client}`, price: 100, eventsPerMonth: 200, aiIncludedRubPerMonth: 321, allowProposals: true, allowClientReviews: true, allowAi: true, allowTelegramIntegration: true })
        const post = await f.request(client, '/mobile/v1/billing', 'POST', { tariffId: String(target._id) })
        assert.equal(post.status, 200, JSON.stringify(post.body)); assert.equal(post.body.success, true)
        assert.equal(post.body.data.currentTariff._id, String(target._id)); assert.equal(post.body.data.currentTariff.aiIncludedRubPerMonth, 321)
        for (const key of ['allowProposals', 'allowClientReviews', 'allowAi', 'allowTelegramIntegration']) assert.equal(post.body.data.currentTariff[key], true)
        assert.deepEqual(Object.keys(post.body.data.aiIncludedRates).sort(), ['eventDraftRub', 'fileRecordRub', 'transcriptionRubPerSecond', 'voiceNoteRub'].sort())
        const get = await f.request(client, '/mobile/v1/billing'); assert.equal(get.status, 200)
        assert.deepEqual(get.body.data.currentTariff, post.body.data.currentTariff)
        assert.deepEqual(get.body.data.aiIncludedRates, post.body.data.aiIncludedRates)
        assert.equal(String((await f.model('Users').findById(f.user._id).lean()).tariffId), String(target._id))
        assert.equal((await f.request(client, '/mobile/v1/billing', 'POST', { tariffId: String(target._id) })).status, 409)
        assert.equal((await f.request(client, '/mobile/v1/billing', 'POST', { tariffId: '$invalid' })).status, 400)
        row.status = 'passed'
      } catch (e) { row.status = 'failed'; row.error = e.message; throw e }
      finally { fs.writeFileSync(`${reports}/AUTHOR-${run}-cell-${client}.json`, JSON.stringify(row), { flag: 'wx' }) }
    })
  } finally {
    await f.teardown()
    fs.writeFileSync(`${reports}/AUTHOR-${run}-matrix.json`, JSON.stringify(cells, null, 2), { flag: 'wx' })
  }
})
