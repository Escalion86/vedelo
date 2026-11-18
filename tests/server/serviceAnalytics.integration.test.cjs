const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const net = require('node:net')
const mongoose = require('mongoose')
const { loadBindings, transformSync } = require('next/dist/build/swc')

let db,
  processRef,
  dir,
  Users,
  Payments,
  Tariffs,
  SiteSettings,
  GET,
  activityProfile,
  context,
  activity,
  visits
function compile(file, resolve) {
  const filename = path.resolve(file)
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: { parser: { syntax: 'ecmascript' } },
    module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports)
  return mod.exports
}
test.before(async () => {
  await loadBindings()
  const listener = net.createServer().listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  dir = mkdtempSync(path.join(tmpdir(), 'vedelo-analytics-'))
  processRef = spawn(
    'mongod',
    [
      '--dbpath',
      dir,
      '--port',
      String(port),
      '--bind_ip',
      '127.0.0.1',
      '--quiet',
    ],
    { windowsHide: true, stdio: 'ignore' }
  )
  db = mongoose.createConnection(`mongodb://127.0.0.1:${port}/analytics_test`, {
    serverSelectionTimeoutMS: 20000,
  })
  await db.asPromise()
  Users = db.model(
    'Users',
    new mongoose.Schema(
      {
        role: String,
        tenantId: mongoose.Schema.Types.ObjectId,
        acquisitionFunnel: mongoose.Schema.Types.Mixed,
      },
      { strict: false }
    )
  )
  Payments = db.model('Payments', new mongoose.Schema({}, { strict: false }))
  Tariffs = db.model('Tariffs', new mongoose.Schema({}, { strict: false }))
  SiteSettings = db.model(
    'SiteSettings',
    new mongoose.Schema({
      tenantId: { type: mongoose.Schema.Types.ObjectId, unique: true },
      custom: { type: Map, of: mongoose.Schema.Types.Mixed },
      syncVersion: { type: Number, default: 1 },
    }, { timestamps: true })
  )
  await SiteSettings.init()
  const activitySchema = new mongoose.Schema({
    tenantId: mongoose.Schema.Types.ObjectId,
    userId: mongoose.Schema.Types.ObjectId,
    day: String,
    firstSeenAt: Date,
  })
  activitySchema.index({ tenantId: 1, userId: 1, day: 1 }, { unique: true })
  activity = db.model('Activity', activitySchema)
  await activity.init()
  const core = await import('../../server/serviceAnalytics.mjs')
  const profileCore = await import('../../helpers/activityProfile.mjs')
  let profileStore
  const resolve = (id) =>
    ({
      '@server/getRequestContext': async () => context,
      '@server/dbConnect': async () => {},
      '@models/Users': Users,
      '@models/Payments': Payments,
      '@models/Tariffs': Tariffs,
      '@models/SiteSettings': SiteSettings,
      '@models/ServiceActivityDays': activity,
      '@server/serviceAnalytics.mjs': core,
      '@server/activityProfile': profileStore,
      '@server/tenantTerminology': { clearTenantWorkItemTerminologyCache: () => {} },
      '@helpers/activityProfile.mjs': profileCore,
    })[id] || require(id)
  profileStore = compile('server/activityProfile.js', resolve)
  GET = compile('app/api/developer/analytics/route.js', resolve).GET
  activityProfile = compile('app/api/activity-profile/route.js', resolve)
  visits = compile('server/acquisitionFunnel.js', resolve).recordCabinetVisit
})
test.after(async () => {
  await db?.close()
  if (processRef && processRef.exitCode === null) {
    const stopped = once(processRef, 'exit')
    processRef.kill()
    await stopped
  }
  if (dir) rmSync(dir, { recursive: true, force: true })
})

test('actual route denies cross-tenant user/admin and rechecks stale developer role', async () => {
  for (const role of ['user', 'admin']) {
    context = {
      user: { _id: new mongoose.Types.ObjectId(), role },
      tenantId: String(new mongoose.Types.ObjectId()),
    }
    assert.equal(
      (
        await GET(
          new Request('http://localhost/api/developer/analytics?tenantId=other')
        )
      ).status,
      403
    )
  }
  context = null
  assert.equal(
    (await GET(new Request('http://localhost/api/developer/analytics'))).status,
    401
  )
  const actor = await Users.create({ role: 'user' })
  context = {
    user: { _id: actor._id, role: 'dev' },
    tenantId: String(actor._id),
  }
  assert.equal(
    (await GET(new Request('http://localhost/api/developer/analytics'))).status,
    403
  )
})

test('Mongo aggregates real payment categories and excludes service/test accounts', async () => {
  const dev = await Users.create({ role: 'dev' })
  const a = await Users.create({
    role: 'user',
    firstName: 'A',
    createdAt: new Date('2026-06-01'),
  })
  const b = await Users.create({
    role: 'user',
    firstName: 'B',
    createdAt: new Date('2026-06-02'),
  })
  context = { user: { _id: dev._id, role: 'dev' }, tenantId: String(dev._id) }
  const base = {
    userId: a._id,
    tenantId: a._id,
    createdAt: new Date('2026-06-05'),
    paidAt: new Date('2026-06-05'),
    status: 'succeeded',
    purpose: 'balance',
  }
  await Payments.insertMany([
    { ...base, type: 'topup', source: 'tochka', amount: 1000 },
    {
      ...base,
      type: 'charge',
      source: 'system',
      purpose: 'tariff',
      amount: 500,
    },
    { ...base, type: 'charge', source: 'system', purpose: 'ai', amount: 50 },
    { ...base, type: 'topup', source: 'system', amount: 100 },
    { ...base, type: 'topup', source: 'manual', amount: 200 },
    { ...base, type: 'refund', source: 'system', amount: 50 },
    { ...base, type: 'topup', source: 'tochka', amount: 300, status: 'failed' },
    {
      ...base,
      type: 'topup',
      source: 'system',
      amount: 9999,
      referralRewardPending: true,
    },
    {
      ...base,
      userId: b._id,
      tenantId: b._id,
      type: 'topup',
      source: 'yookassa',
      amount: 9000,
    },
    {
      ...base,
      userId: dev._id,
      tenantId: dev._id,
      type: 'topup',
      source: 'tochka',
      amount: 8000,
    },
  ])
  const response = await GET(
    new Request(
      `http://localhost/api/developer/analytics?from=2026-06-01&to=2026-06-30&exclude=${b._id}`
    )
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const { data } = await response.json()
  assert.equal(data.current.receipts, 1000)
  assert.equal(data.current.tariffs, 500)
  assert.equal(data.current.ai, 50)
  assert.equal(data.current.bonuses, 100)
  assert.equal(data.current.manual, 200)
  assert.equal(data.current.refunds, 50)
  assert.equal(data.current.failed, 1)
  assert.equal(data.current.firstPayers, 1)
  assert.equal(data.current.conversion, 100)
  assert.equal(
    data.users.some((u) => u.id === String(b._id)),
    false
  )
})

test('activity uses stored tenant and deduplicates each UTC day', async () => {
  const tenant = new mongoose.Types.ObjectId()
  const user = await Users.create({ role: 'user', tenantId: tenant })
  const now = new Date('2026-09-23T09:00:00Z')
  await visits(user._id, now)
  await visits(user._id, now)
  const rows = await activity.find({ userId: user._id }).lean()
  assert.equal(rows.length, 1)
  assert.equal(String(rows[0].tenantId), String(tenant))
  assert.equal(rows[0].day, '2026-09-23')
  await visits(user._id, new Date('2026-09-24T00:00:00Z'))
  assert.equal(await activity.countDocuments({ userId: user._id }), 2)
})

test('activity profile requires owner, isolates tenants and preserves unrelated settings on retry', async () => {
  const owner = new mongoose.Types.ObjectId()
  const otherTenant = new mongoose.Types.ObjectId()
  const teammate = new mongoose.Types.ObjectId()
  await SiteSettings.create([
    {
      tenantId: owner,
      custom: {
        firstRunWizardCompleted: true,
        onboardingActivityPreset: 'other',
        onboardingActivityOtherDescription: '  ',
        primaryEntityTerminology: 'events',
        defaultEventDurationMinutes: 17,
      },
    },
    { tenantId: otherTenant, custom: { onboardingActivityPreset: 'consulting' } },
  ])
  const request = (body) => new Request('http://localhost/api/activity-profile', body
    ? { method: 'PATCH', body: JSON.stringify(body) }
    : undefined)
  const patch = () => request({ tenantId: String(otherTenant), preset: 'other', otherDescription: '  Груминг \n собак ' })
  context = { user: { _id: teammate }, tenantId: String(owner) }
  assert.equal((await activityProfile.PATCH(patch())).status, 403)
  assert.equal((await (await activityProfile.GET(request())).json()).data.required, false)
  context = { user: { _id: owner, impersonation: { active: true } }, tenantId: String(owner) }
  assert.equal((await activityProfile.PATCH(patch())).status, 403)
  context = { user: null, tenantId: null }
  assert.equal((await activityProfile.GET(request())).status, 401)
  context = { user: { _id: owner }, tenantId: String(owner) }
  const before = await activityProfile.GET(request())
  assert.equal(before.headers.get('cache-control'), 'private, no-store')
  assert.equal((await before.json()).data.required, true)
  assert.equal((await activityProfile.PATCH(request({ preset: 'other', otherDescription: ' \t ' }))).status, 400)
  assert.equal((await activityProfile.PATCH(request({ preset: 'bad' }))).status, 400)
  assert.equal((await activityProfile.PATCH(request({ preset: 'beauty', terminology: 'bad' }))).status, 400)

  const responses = await Promise.all([activityProfile.PATCH(patch()), activityProfile.PATCH(patch())])
  for (const response of responses) {
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).data, {
      required: false, canEdit: true, preset: 'other', otherDescription: 'Груминг собак',
      terminology: 'events', completed: true,
    })
  }
  const settings = await SiteSettings.findOne({ tenantId: owner }).lean()
  assert.equal(settings.syncVersion, 2)
  assert.equal(settings.custom.defaultEventDurationMinutes, 17)
  assert.equal((await SiteSettings.findOne({ tenantId: otherTenant }).lean()).custom.onboardingActivityPreset, 'consulting')
})

test('analytical distribution groups activities once per workspace and keeps blank and other separate', async () => {
  const [owner, secondOwner, legacyOwner, unspecified, archived, dev] = await Users.create([
    { role: 'user' }, { role: 'user' }, { role: 'user' }, { role: 'user' },
    { role: 'user', archive: true }, { role: 'dev' },
  ])
  await Users.create({ tenantId: owner._id, role: 'user' })
  await SiteSettings.create([
    { tenantId: owner._id, custom: { onboardingActivityPreset: 'other', onboardingActivityOtherDescription: 'Груминг  собак' } },
    { tenantId: secondOwner._id, custom: { onboardingActivityPreset: 'other', onboardingActivityOtherDescription: 'груминг собак' } },
    { tenantId: legacyOwner._id, custom: { onboardingActivityPreset: 'other' } },
    { tenantId: unspecified._id, custom: { onboardingActivityPreset: 'unrecognized' } },
    { tenantId: archived._id, custom: { onboardingActivityPreset: 'beauty' } },
    { tenantId: dev._id, custom: { onboardingActivityPreset: 'beauty' } },
  ])
  context = { user: { _id: dev._id, role: 'dev' }, tenantId: String(dev._id) }
  const response = await GET(new Request('http://localhost/api/developer/analytics'))
  assert.equal(response.status, 200)
  const { data: { activities } } = await response.json()
  assert.equal(activities.rows.find(({ key }) => key === 'other').count, 3)
  assert.ok(activities.rows.find(({ key }) => key === '').count > 0)
  assert.equal(activities.rows.find(({ key }) => key === 'beauty').count, 0)
  assert.equal(activities.withoutDescription, 1)
  assert.deepEqual(activities.other, [{ key: 'груминг собак', label: 'Груминг собак', count: 2 }])
})
