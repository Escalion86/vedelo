const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { fixture, reports } = require('./apiCycleFixture.cjs')
const phase = process.env.AUTHOR_PHASE || 'green'
const run = process.env.AUTHOR_RUN || phase
const cells = []
test('T actual handlers / old bearer / v1 bearer / cookie web', { timeout: 180000 }, async (t) => {
  const scope = JSON.parse(fs.readFileSync(`${reports}/SCOPE-T.json`))
  const crypto = require('node:crypto')
  const sourceSHA = Object.fromEntries([...scope.closurePaths, ...scope.allowedRuntimePaths, 'package.json', 'package-lock.json', 'server/mobile/tests/apiCycle.test.cjs', 'server/mobile/tests/apiCycleFixture.cjs'].map((p) => [p, fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : null]))
  fs.writeFileSync(`${reports}/AUTHOR-${run}-actual-source.json`, JSON.stringify({ sourceSHA, startedAt: new Date().toISOString() }, null, 2), { flag: 'wx' })
  const f = await fixture(run)
  const cell = async (name, client, fn) => t.test(`${client}: ${name}`, async () => {
    const row = { testcase: `${client}: ${name}`, client, status: 'executed', command: `AUTHOR-${run}` }
    cells.push(row)
    try { await fn(); row.status = 'passed' } catch (e) { row.status = 'failed'; row.error = e.message; throw e }
    finally { fs.writeFileSync(`${reports}/AUTHOR-${run}-cell-${cells.length}.json`, JSON.stringify(row, null, 2), { flag: 'wx' }) }
  })
  const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.body)); assert.equal(r.body.success, true); return r.body.data }
  try {
    if (phase === 'preflight') {
      await cell('real cookie NextAuth and mobile auth billing', 'web', async () => { ok(await f.request('web', '/mobile/v1/billing')); ok(await f.request('old', '/mobile/v1/billing')); ok(await f.request('new', '/mobile/v1/billing')) })
      return
    }
    await cell('defaults GET returns materialized caller DTO', 'new', async () => {
      const d = ok(await f.request('new', '/proposal-templates/defaults'))
      assert.ok(Array.isArray(d.blocks)); assert.ok(Array.isArray(d.media)); assert.ok(Array.isArray(d.defaults.packages)); assert.ok(Array.isArray(d.defaults.servicesIds)); assert.equal(typeof d.messageTemplate, 'string')
    })
    await cell('template private POST previews unsaved content without persistence', 'new', async () => {
      const before = await f.model('ProposalTemplates').findById(f.template._id).lean()
      const d = ok(await f.request('new', `/proposal-templates/${f.template._id}/preview`, 'POST', { name: 'Unsaved template', blocks: [{ id: 'intro', type: 'intro', contentHtml: '<p>Unsaved</p>' }], defaults: { packages: f.packages } }))
      assert.equal(d.title, 'Unsaved template'); assert.equal(d.packages[0].total, 700)
      assert.deepEqual(await f.model('ProposalTemplates').findById(f.template._id).lean(), before)
    })
    await cell('proposal private POST previews unsaved content without persistence', 'new', async () => {
      const before = await f.model('Proposals').findById(f.proposal._id).lean()
      const d = ok(await f.request('new', `/proposals/${f.proposal._id}/preview`, 'POST', { title: 'Unsaved proposal', packages: f.packages }))
      assert.equal(d.title, 'Unsaved proposal'); assert.equal(d.packages[0].total, 700)
      assert.deepEqual(await f.model('Proposals').findById(f.proposal._id).lean(), before)
    })
    await cell('ordinary API accepts v1 bearer and rejects malformed auth even with cookie', 'new', async () => {
      assert.ok(Array.isArray(ok(await f.request('new', '/proposal-templates'))))
      assert.equal((await f.request('web', '/proposal-templates', 'GET', undefined, { authorization: 'Basic invalid' })).status, 401)
      assert.equal((await f.request('new', `/proposals/${f.foreignProposal._id}`)).status, 404)
    })
    await cell('supplied malformed Authorization never falls back to valid cookie', 'web', async () => {
      assert.equal((await f.request('web', '/proposal-templates', 'GET', undefined, { authorization: 'Basic invalid' })).status, 401)
      assert.equal((await f.request('web', '/client-reviews/statuses', 'GET', undefined, { authorization: 'Basic invalid' })).status, 401)
    })
    if (phase === 'red') return
    // Extended GREEN matrix is appended below; the four RED cases stay unchanged.
    for (const identity of ['old', 'new', 'web']) {
      await cell('defaults and both previews / identity guards', identity, async () => {
        ok(await f.request(identity, '/proposal-templates/defaults'))
        ok(await f.request(identity, '/proposal-templates/new/preview', 'POST', { name: 'New draft', defaults: { packages: f.packages } }))
        ok(await f.request(identity, `/proposals/${f.proposal._id}/preview`, 'POST', { title: 'Draft' }))
        assert.equal((await f.request(identity, `/proposal-templates/${f.foreignTemplate._id}/preview`, 'POST', {})).status, 404)
        assert.equal((await f.request(identity, `/proposals/${f.foreignProposal._id}/preview`, 'POST', {})).status, 404)
        assert.equal((await f.request(identity, '/proposal-templates', 'GET', undefined, { authorization: 'Bearer invalid' })).status, 401)
      })
      await cell('proposal create / save / exact readback / apply / actual event', identity, async () => {
        const event = await f.model('Events').create({ tenantId: f.user._id, clientId: f.client._id, status: 'draft' })
        const created = ok(await f.request(identity, `/events/${event._id}/proposals`, 'POST', { title: `Create ${identity}`, packages: f.packages }), 201)
        assert.equal(created.eventId, String(event._id)); assert.equal(created.artistSnapshot.fullName, `${f.user.firstName} ${f.user.secondName}`)
        const saved = ok(await f.request(identity, `/proposals/${created._id}`, 'PATCH', { title: `Saved ${identity}`, validUntil: null, blocks: [{ id: 'intro', type: 'intro', contentHtml: '<p>Rich fixture</p>' }], packages: f.packages }))
        assert.equal(saved.validUntil, null)
        assert.deepEqual(ok(await f.request(identity, `/proposals/${created._id}`)), saved)
        await f.model('Proposals').updateOne({ _id: created._id }, { $set: { selectedPackageId: 'main', selectedAt: new Date() } })
        const applied = ok(await f.request(identity, `/proposals/${created._id}`, 'PATCH', { action: 'apply' }))
        assert.ok(applied.appliedAt)
        const actual = ok(await f.request(identity, `/mobile/v1/events/${event._id}`))
        assert.equal(actual._id, String(event._id)); assert.equal(actual.contractSum, 700); assert.deepEqual(actual.servicesIds, [String(f.service._id)]); assert.equal(actual.agreedProposal.packageId, 'main')
        await f.model('Events').updateOne({ _id: event._id }, { $set: { status: 'closed' } })
        assert.equal((await f.request(identity, `/proposals/${created._id}`, 'PATCH', { action: 'apply' })).status, 409)
        assert.equal((await f.request(identity, `/events/${f.otherEvent._id}/proposals`, 'POST', {})).status, 404)
        assert.equal((await f.request(identity, `/proposals/${f.foreignProposal._id}`, 'PATCH', { title: 'Wrong' })).status, 404)
        const template = ok(await f.request(identity, '/proposal-templates', 'POST', { name: `Created ${identity}`, defaults: { packages: f.packages } }), 201)
        const edited = ok(await f.request(identity, `/proposal-templates/${template._id}`, 'PATCH', { name: `Saved ${identity}` }))
        assert.deepEqual(ok(await f.request(identity, `/proposal-templates/${template._id}`)), edited)
        assert.ok(ok(await f.request(identity, '/services')).some((s) => s._id === String(f.service._id)))
        ok(await f.request(identity, '/proposals/statuses'))
      })
      await cell('reviews / statuses / notes / filters / review-page / body validation', identity, async () => {
        const review = ok(await f.request(identity, '/client-reviews', 'POST', { eventId: String(f.closed._id), confirmedCompleted: true }))
        assert.equal(review.eventId, String(f.closed._id)); assert.equal(review.status, 'created')
        const note = ok(await f.request(identity, `/client-reviews/${review._id}`, 'PATCH', { action: 'note', note: `Note ${identity}` }))
        const list = ok(await f.request(identity, `/client-reviews?eventId=${f.closed._id}&page=0`))
        assert.equal(list.items.find((r) => r._id === review._id).note, note.note)
        assert.equal(ok(await f.request(identity, '/client-reviews/statuses'))[String(f.closed._id)].status, 'created')
        ok(await f.request(identity, '/client-reviews?from=2026-10-01&to=2026-10-31&rating=5&unread=true&page=0'))
        assert.equal((await f.request(identity, '/client-reviews?from=2026-02-31')).status, 400)
        assert.equal((await f.request(identity, '/client-reviews', 'POST', { eventId: String(f.otherEvent._id) })).status, 404)
        const before = ok(await f.request(identity, '/site/review-page')); assert.equal(typeof before.allowClientReviews, 'boolean')
        const appearance = { publicName: `Public ${identity}`, specialization: 'Synthetic', greeting: 'Hello', accent: 'sand', cover: 'plain', logoUrl: '' }
        ok(await f.request(identity, '/site/review-page', 'POST', appearance))
        assert.deepEqual(ok(await f.request(identity, '/site/review-page')).reviewPage, appearance)
        assert.equal((await f.request(identity, '/site/review-page', 'POST', [])).status, 400)
        assert.equal((await f.request(identity, '/site/review-page', 'POST', { ...appearance, logoUrl: `https://cloud.escalion.ru/uploads/vedelo/${f.foreign._id}/review-page/logo/00000000-0000-0000-0000-000000000000/logo.webp` })).status, 400)
        assert.equal((await f.request(identity, '/client-reviews/statuses', 'GET', undefined, { authorization: 'Basic invalid' })).status, 401)
      })
      await cell('upload destinations / real sharp / MIME and container / logo', identity, async () => {
        const sharp = require('sharp')
        const png = await sharp({ create: { width: 3, height: 3, channels: 3, background: '#abcdef' } }).png().toBuffer()
        const form = (directory, bytes = png, type = 'image/png', legacy = false) => {
          const data = new FormData()
          if (legacy) { data.append('project', 'artistcrm'); data.append('folder', directory) } else data.append('directory', directory)
          data.append('files', new File([bytes], 'fixture.png', { type })); return data
        }
        const upload = ok(await f.request(identity, '/escalioncloud', 'POST', form(`proposals/${f.proposal._id}`, png, 'image/png', identity === 'old')))
        assert.match(upload.url, new RegExp(`/artistcrm/${f.user._id}/proposals/${f.proposal._id}/`))
        for (const directory of [`proposal-templates/${f.template._id}`, 'proposal-templates/draft', 'artistcrm/users', 'artistcrm/services', `artistcrm/${f.user._id}/mobile/profile`]) ok(await f.request(identity, '/escalioncloud', 'POST', form(directory)))
        ok(await f.request(identity, '/escalioncloud', 'POST', form(`artistcrm/${f.user._id}/mobile`, Buffer.from('synthetic document'), 'application/pdf')))
        const fixtureDir = '/home/aleksei/projects/vedelo-android-update-20261011/tests/android-proposals/fixtures.stageH'
        const manifest = JSON.parse(fs.readFileSync(`${fixtureDir}/manifest.stageH.json`))
        for (const [name, mime] of [['regular.mp4','video/mp4'],['fragmented.mp4','video/mp4'],['stream.webm','video/webm'],['unknown-clusters.webm','video/webm']]) {
          const bytes = fs.readFileSync(`${fixtureDir}/${name}`)
          assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), manifest.files[name].sha256)
          ok(await f.request(identity, '/escalioncloud', 'POST', form(`proposals/${f.proposal._id}`, bytes, mime)))
        }
        const count = f.cloudCalls.length
        for (const directory of ['../proposals/x', `proposals/${f.foreignProposal._id}`, `proposal-templates/${f.foreignTemplate._id}`, `artistcrm/${f.foreign._id}/mobile`, 'artistcrm/news/draft']) {
          const r = await f.request(identity, '/escalioncloud', 'POST', form(directory)); assert.ok([400,403,404].includes(r.status), JSON.stringify(r))
        }
        for (const [bytes,type] of [[Buffer.from('invalid image'),'image/png'],[Buffer.from('<script>bad</script>'),'text/html'],[Buffer.from('ftyp not mp4'),'video/mp4'],[Buffer.from([0x1a,0x45,0xdf,0xa3,0]),'video/webm']]) assert.equal((await f.request(identity, '/escalioncloud', 'POST', form(`proposals/${f.proposal._id}`,bytes,type))).status,400)
        const ambiguous = form(`proposals/${f.proposal._id}`); ambiguous.append('directory', `proposals/${f.proposal._id}`)
        assert.equal((await f.request(identity, '/escalioncloud', 'POST', ambiguous)).status,400)
        assert.equal(f.cloudCalls.length, count, 'Rejected batches never call cloud')
        const logo = () => { const d = new FormData(); d.append('file',new File([png],'logo.png',{type:'image/png'}));return d }
        const pLogo = ok(await f.request(identity, `/proposals/${f.proposal._id}/logo`, 'POST', logo()))
        assert.match(pLogo.url, new RegExp(`/vedelo/${f.user._id}/proposals/${f.proposal._id}/logos/`))
        ok(await f.request(identity, `/proposals/${f.proposal._id}`, 'PATCH', { appearance: { theme: 'blue', logoUrl: pLogo.url } }))
        assert.equal(ok(await f.request(identity, `/proposals/${f.proposal._id}`)).appearance.logoUrl, pLogo.url)
        const rLogo = ok(await f.request(identity, '/site/review-page/logo', 'POST', logo()))
        assert.match(rLogo.url, new RegExp(`/vedelo/${f.user._id}/review-page/logo/`))
        assert.equal((await f.request(identity, `/proposals/${f.foreignProposal._id}/logo`, 'POST', logo())).status,404)
      })
      await cell('additive billing fields / rates / statistics filters and isTransferred', identity, async () => {
        const d = ok(await f.request(identity, '/mobile/v1/billing'))
        assert.equal(d.currentTariff.aiIncludedRubPerMonth, 123)
        for (const flag of ['allowProposals','allowClientReviews','allowAi','allowTelegramIntegration','allowStatistics','allowCalendarSync','allowTelephony','allowPublicLeadApi']) assert.equal(d.currentTariff[flag],true)
        assert.deepEqual(Object.keys(d.aiIncludedRates).sort(),['eventDraftRub','fileRecordRub','transcriptionRubPerSecond','voiceNoteRub'].sort())
        for (const rate of Object.values(d.aiIncludedRates)) assert.ok(Number.isFinite(rate) && rate >= 0)
        const stats = ok(await f.request(identity, '/mobile/v1/statistics?year=2026&town=FixtureTown&status=active'))
        assert.deepEqual(stats.filters,{ year:2026,town:'FixtureTown',status:'active' })
        assert.equal(stats.events.find((e) => e._id === String(f.event._id)).isTransferred,true)
        assert.ok(stats.events.every((e) => e._id !== String(f.otherEvent._id)))
      })
      await cell('Telegram partial_delivery / exact readback / retryFailedOnly', identity, async () => {
        const sentProposal = await f.model('Proposals').create({ tenantId: f.user._id, eventId: f.event._id, clientId: f.client._id, title: 'Telegram synthetic', status: 'published', packages: f.packages, publicId: `synthetic-public-${identity}`, publicTokenNonce: 'synthetic-nonce', mediaSnapshot: [{ id: 'photo', kind: 'image', url: 'https://cloud.escalion.ru/uploads/fixture/photo.png' }] })
        await f.model('SiteSettings').findOneAndUpdate({ tenantId: f.user._id }, { $set: { custom: { telegramBusinessEnabled: true, telegramBusinessBotToken: 'synthetic-bot', telegramBusinessConnectionId: 'fixture-business', telegramBusinessRights: { can_reply: true } } } }, { upsert: true })
        await f.model('TelegramConversations').findOneAndUpdate({ tenantId: f.user._id, telegramChatId: '777' }, { $set: { clientId: f.client._id, eventId: f.event._id, businessConnectionId: 'fixture-business', lastIncomingAt: new Date() } }, { upsert: true })
        f.denyMedia()
        const partial = await f.request(identity, `/proposals/${sentProposal._id}/send-telegram`, 'POST', { retryFailedOnly: false })
        assert.equal(partial.status, 207, JSON.stringify(partial.body)); assert.equal(partial.body.error.code, 'partial_delivery')
        const read = ok(await f.request(identity, `/proposals/${sentProposal._id}`)); assert.ok(read.delivery.some((d) => d.status === 'failed')); assert.ok(read.delivery.some((d) => d.type === 'text' && d.status === 'sent'))
        const count = f.telegramCalls.length; f.allowMedia()
        ok(await f.request(identity, `/proposals/${sentProposal._id}/send-telegram`, 'POST', { retryFailedOnly: true }), 201)
        assert.ok(f.telegramCalls.slice(count).every((r) => r.method !== 'sendMessage')); assert.ok(f.telegramCalls.length > count)
        const reread = ok(await f.request(identity, `/proposals/${sentProposal._id}`)); assert.equal(reread.delivery.at(-1).status, 'sent')
      })
      await cell('wrong event owner blocks preview and upload before outbound', identity, async () => {
        const wrong = await f.model('Proposals').create({ tenantId: f.user._id, eventId: f.otherEvent._id, title: 'Wrong linked event', packages: f.packages })
        const before = f.cloudCalls.length
        assert.equal((await f.request(identity, `/proposals/${wrong._id}/preview`, 'POST', {})).status, 404)
        const form = new FormData(); form.append('directory', `proposals/${wrong._id}`); form.append('files', new File(['synthetic bad bytes'], 'image.png', { type: 'image/png' }))
        assert.equal((await f.request(identity, '/escalioncloud', 'POST', form)).status, 404)
        const logo = new FormData(); logo.append('file', new File(['synthetic bad bytes'], 'image.png', { type: 'image/png' }))
        assert.equal((await f.request(identity, `/proposals/${wrong._id}/logo`, 'POST', logo)).status, 404)
        assert.equal(f.cloudCalls.length, before)
      })
      await cell('tariff denials preserve readable reviews and prevent outbound', identity, async () => {
        await f.model('Tariffs').updateOne({_id:f.tariff._id},{$set:{allowProposals:false,allowClientReviews:false,allowStatistics:false}})
        try {
          for (const [url,method,body] of [['/proposal-templates/defaults','GET'],[`/proposal-templates/${f.template._id}/preview`,'POST',{}],[`/proposals/${f.proposal._id}/preview`,'POST',{}],['/client-reviews','POST',{eventId:String(f.closed._id)}],['/site/review-page','POST',{}],['/mobile/v1/statistics','GET']]) assert.equal((await f.request(identity,url,method,body)).status,403)
          const cloudCount = f.cloudCalls.length
          const sharp = require('sharp'), png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#abcdef' } }).png().toBuffer()
          const upload = new FormData(); upload.append('directory', `proposals/${f.proposal._id}`); upload.append('files', new File([png], 'fixture.png', { type: 'image/png' }))
          assert.equal((await f.request(identity, '/escalioncloud', 'POST', upload)).status, 403)
          const logo = new FormData(); logo.append('file', new File([png], 'fixture.png', { type: 'image/png' }))
          assert.equal((await f.request(identity, '/site/review-page/logo', 'POST', logo)).status, 403)
          assert.equal((await f.request(identity, `/proposals/${f.proposal._id}/logo`, 'POST', logo)).status, 403)
          assert.equal(f.cloudCalls.length, cloudCount)
          ok(await f.request(identity,'/client-reviews?page=0')); ok(await f.request(identity,'/site/review-page'))
        } finally { await f.model('Tariffs').updateOne({_id:f.tariff._id},{$set:{allowProposals:true,allowClientReviews:true,allowStatistics:true}}) }
      })

    }
    await cell('v1 revoked session and wrong tenant token are rejected', 'new', async () => {
      const tokens = require('../../../tests/server/loadWithAliases.cjs')
      const loader = await tokens.createLoader()
      const token = loader.load('server/mobile/tokens.js').createMobileAccessToken({ user: f.user, tenantId: f.foreign._id, sessionId: f.session._id }).token
      assert.equal((await f.request('new', '/proposal-templates', 'GET', undefined, { authorization: `Bearer ${token}` })).status, 401)
      await f.model('MobileSessions').updateOne({ _id: f.session._id }, { $set: { revokedAt: new Date() } })
      assert.equal((await f.request('new', '/proposal-templates')).status, 401)
      ok(await f.request('old', '/proposal-templates'))
    })

  } finally {
    await f.teardown()
    fs.writeFileSync(`${reports}/AUTHOR-${run}-matrix.json`, JSON.stringify(cells, null, 2), { flag: 'wx' })
  }
})
