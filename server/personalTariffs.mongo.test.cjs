const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const mongoose = require('mongoose')
const { loadBindings, transformSync } = require('next/dist/build/swc')

async function load(file, mocks) {
  const { code } = transformSync(await fs.readFile(file, 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => {
      if (name in mocks) return mocks[name]
      throw new Error(`Unexpected import ${name}`)
    },
    loaded,
    loaded.exports
  )
  return loaded.exports
}

test(
  'personal tariffs: real Mongo, API isolation, grants, schedule, money and recovery',
  { timeout: 90000 },
  async (t) => {
    await loadBindings()
    const { createPersonalTariffService } =
      await import('./personalTariffService.js')
    const access = await import('../helpers/personalTariffs.mjs')
    const usersSchema = (
      await load('schemas/usersSchema.js', {
        mongoose,
        '@helpers/constants': {
          DEFAULT_GOOGLE_CALENDAR_REMINDERS: {
            overrides: [],
            useDefault: false,
          },
          DEFAULT_USERS_NOTIFICATIONS: {},
        },
        '@helpers/maxContact': { isValidMaxContact: () => true },
      })
    ).default
    const tariffsSchema = (await import('../schemas/tariffsSchema.js')).default
    const paymentsSchema = (await import('../schemas/paymentsSchema.js'))
      .default
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'vedelo-personal-tariffs-')
    )
    const probe = net.createServer()
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const port = probe.address().port
    await new Promise((resolve) => probe.close(resolve))
    const child = spawn(
      process.env.TARIFF_TEST_MONGOD || 'mongod',
      [
        '--dbpath',
        directory,
        '--bind_ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--quiet',
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
    const exited = once(child, 'exit')
    let connection
    try {
      connection = await mongoose
        .createConnection(`mongodb://127.0.0.1:${port}/tariff_test`, {
          serverSelectionTimeoutMS: 30000,
        })
        .asPromise()
      const Users = connection.model('Users', new mongoose.Schema(usersSchema))
      const Tariffs = connection.model(
        'Tariffs',
        new mongoose.Schema(tariffsSchema)
      )
      const ps = new mongoose.Schema(paymentsSchema, { timestamps: true })
      ps.index({ tenantId: 1, userId: 1, idempotenceKey: 1 }, { unique: true })
      const Payments = connection.model('Payments', ps)
      await Promise.all([Users.init(), Tariffs.init(), Payments.init()])
      const service = createPersonalTariffService({ Users, Tariffs, Payments })
      const [business, bro, secret, free] = await Tariffs.create([
        { title: 'БИЗНЕС', price: 1000 },
        { title: 'BRO', price: 200, hidden: true },
        { title: 'SECRET', price: 100, hidden: true },
        { title: 'FREE', price: 0 },
      ])
      const now = new Date('2026-10-17T00:00:00Z'),
        end = new Date('2026-10-20T00:00:00Z')
      const fresh = async () => {
        const id = new mongoose.Types.ObjectId()
        return (
          await Users.create({
            _id: id,
            tenantId: id,
            tariffId: business._id,
            tariffActiveUntil: end,
            nextChargeAt: end,
            balance: 1000,
          })
        ).toObject()
      }
      const read = (id) => Users.findById(id).lean()
      let context
      const routes = await load('app/api/billing/preferences/route.js', {
        'next/server': {
          NextResponse: { json: (data, init) => Response.json(data, init) },
        },
        mongoose,
        '@models/Users': Users,
        '@models/Tariffs': Tariffs,
        '@server/getRequestContext': async () => context,
        '@server/dbConnect': async () => {},
        '@server/personalTariffs': service,
        '@server/aiIncludedEstimate': {
          withAiIncludedEstimates: async (items) => items,
        },
        '@helpers/personalTariffs.mjs': access,
      })
      const request = (userId, body) =>
        new Request(
          `http://test/api/billing/preferences${userId ? `?userId=${userId}` : ''}`,
          body ? { method: 'POST', body: JSON.stringify(body) } : {}
        )
      await t.test(
        'only explicitly granted tariff is visible; foreign user and self-grant forbidden',
        async () => {
          const user = await fresh(),
            other = await fresh()
          const beforeOther = await read(other._id)
          context = { user, tenantId: String(user.tenantId) }
          assert.equal((await routes.GET(request(other._id))).status, 403)
          assert.equal(
            (
              await routes.POST(
                request(null, {
                  action: 'grant',
                  tariffId: String(bro._id),
                  enabled: true,
                })
              )
            ).status,
            403
          )
          assert.equal(
            (
              await routes.POST(
                request(null, {
                  action: 'schedule',
                  tariffId: String(secret._id),
                })
              )
            ).status,
            403
          )
          let data = (await (await routes.GET(request())).json()).data
          assert.deepEqual(data.tariffs.map((t) => t.title).sort(), [
            'FREE',
            'БИЗНЕС',
          ])
          const updated = await service.grant({
            user,
            tariff: bro,
            enabled: true,
          })
          assert.ok(updated.ok)
          context.user = updated.user
          data = (await (await routes.GET(request())).json()).data
          assert.ok(data.tariffs.some((t) => t.title === 'BRO'))
          assert.ok(!data.tariffs.some((t) => t.title === 'SECRET'))
          assert.equal(
            (await service.change({ user: updated.user, tariff: secret, now }))
              .status,
            403
          )
          assert.deepEqual(await read(other._id), beforeOther)
          context = {
            user: { ...updated.user, role: 'dev' },
            tenantId: String(user.tenantId),
          }
          assert.equal(
            (
              await routes.POST(
                request(other._id, {
                  action: 'grant',
                  tariffId: String(bro._id),
                  enabled: true,
                })
              )
            ).status,
            200
          )
          assert.deepEqual(
            (await read(other._id)).allowedTariffIds.map(String),
            [String(bro._id)]
          )
        }
      )
      await t.test(
        'legacy user PUT cannot buy ungranted hidden tariff or inject it through profile update',
        async () => {
          const route = await load('app/api/users/[id]/route.js', {
            'next/server': {
              NextResponse: { json: (data, init) => Response.json(data, init) },
            },
            mongoose,
            '@models/Users': Users,
            '@models/Histories': {},
            '@models/Tariffs': Tariffs,
            '@models/Events': { aggregate: async () => [] },
            '@server/dbConnect': async () => {},
            '@server/getTenantContext': async () => context,
            bcryptjs: {},
            '@helpers/maxContact': {},
            '@helpers/userEventStats': {
              applyUserEventStats: (users) => users,
            },
            '@server/personalTariffs': service,
            '@helpers/personalTariffs.mjs': access,
          })
          const user = await fresh()
          context = { user, tenantId: String(user.tenantId) }
          const call = (body) =>
            route.PUT(
              new Request('http://test/api/users/' + user._id, {
                method: 'PUT',
                body: JSON.stringify(body),
              }),
              { params: Promise.resolve({ id: String(user._id) }) }
            )
          assert.equal(
            (await call({ tariffId: String(secret._id) })).status,
            403
          )
          assert.equal(
            (await call({ tariffId: String(secret._id), firstName: 'test' }))
              .status,
            403
          )
          assert.equal(
            (await call({ allowedTariffIds: [String(secret._id)] })).status,
            400
          )
          const allowed = await service.grant({
            user,
            tariff: bro,
            enabled: true,
          })
          context.user = allowed.user
          const result = await call({ tariffId: String(bro._id) })
          assert.equal(result.status, 200)
          const payload = await result.json()
          assert.equal(payload.data.tariffId, String(bro._id))
          assert.equal('password' in payload.data, false)
          assert.equal('pendingBillingReceipt' in payload.data, false)
        }
      )
      await t.test(
        'both payment providers enforce exact grant before creating a payment',
        async () => {
          let user = await fresh()
          context = { user, tenantId: String(user.tenantId) }
          for (const provider of ['tochka', 'yookassa']) {
            let claims = 0
            const route = await load(
              `app/api/billing/${provider}/create/route.js`,
              {
                'next/server': {
                  NextResponse: {
                    json: (data, init) => Response.json(data, init),
                  },
                },
                mongoose,
                '@models/Users': Users,
                '@models/Tariffs': Tariffs,
                '@models/Payments': Payments,
                '@server/dbConnect': async () => {},
                '@server/getTenantContext': async () => context,
                '@helpers/personalTariffs.mjs': access,
                ['@server/' + provider]: {
                  isTochkaConfigured: () => true,
                  isYookassaConfigured: () => true,
                },
                '@server/trustedOrigin': {},
                '@server/paymentIntent': {
                  resolvePaymentIdempotenceKey: () => ({ key: 'test-key' }),
                  claimPaymentIntent: async () => {
                    claims++
                    return { claimed: false, payment: {} }
                  },
                  getReusablePaymentIntentData: () => ({
                    confirmationUrl: 'https://example.test/payment',
                  }),
                },
              }
            )
            const call = (tariffId) =>
              route.POST(
                new Request('http://test/pay', {
                  method: 'POST',
                  body: JSON.stringify({ purpose: 'tariff', tariffId }),
                })
              )
            assert.equal((await call(String(secret._id))).status, 404)
            assert.equal((await call({ $ne: null })).status, 400)
            assert.equal(claims, 0)
            user = (
              await service.grant({
                user: await read(user._id),
                tariff: bro,
                enabled: true,
              })
            ).user
            assert.equal((await call(String(bro._id))).status, 200)
            assert.equal(claims, 1)
          }
        }
      )
      await t.test(
        'legacy users without billingRevision can schedule; API rejects malformed IDs',
        async () => {
          let user = await fresh()
          await Users.updateOne(
            { _id: user._id },
            { $unset: { billingRevision: 1 } }
          )
          user = (await Users.findById(user._id)).toObject()
          assert.ok(
            (await service.schedule({ user, tariff: bro, admin: true, now })).ok
          )
          context = { user, tenantId: String(user.tenantId) }
          assert.equal(
            (
              await routes.POST(
                request(null, { action: 'schedule', tariffId: { $ne: null } })
              )
            ).status,
            400
          )
          context = { user: null, tenantId: null }
          assert.equal((await routes.GET(request())).status, 401)
        }
      )
      await t.test(
        'schedule keeps current period/balance; concurrent renewal charges once',
        async () => {
          const user = await fresh()
          const result = await service.schedule({
            user,
            tariff: bro,
            admin: true,
            now,
          })
          assert.ok(result.ok)
          assert.equal(String(result.user.tariffId), String(business._id))
          assert.equal(result.user.balance, 1000)
          assert.equal(+result.user.tariffActiveUntil, +end)
          assert.deepEqual(result.user.allowedTariffIds.map(String), [
            String(bro._id),
          ])
          await service.renewScheduled(now)
          assert.equal((await read(user._id)).balance, 1000)
          await Promise.all([
            service.renewScheduled(end),
            service.renewScheduled(end),
          ])
          const after = await read(user._id)
          assert.equal(after.balance, 800)
          assert.equal(String(after.tariffId), String(bro._id))
          assert.equal(
            +after.tariffActiveUntil,
            +new Date('2026-11-20T00:00:00Z')
          )
          assert.equal(after.pendingTariffChange, null)
          assert.equal(
            await Payments.countDocuments({ userId: user._id, type: 'charge' }),
            1
          )
        }
      )
      await t.test(
        'real renewal route applies pending BRO instead of charging BUSINESS',
        async () => {
          let user = await fresh()
          const expired = new Date(Date.now() - 1000)
          await Users.updateOne(
            { _id: user._id },
            { $set: { tariffActiveUntil: expired, nextChargeAt: expired } }
          )
          user = await read(user._id)
          await service.schedule({
            user,
            tariff: bro,
            admin: true,
            now: new Date(+expired - 1000),
          })
          context = {
            user: { ...user, role: 'dev' },
            tenantId: String(user.tenantId),
          }
          const route = await load('app/api/billing/renew/route.js', {
            'next/server': {
              NextResponse: { json: (data, init) => Response.json(data, init) },
            },
            '@models/Users': Users,
            '@models/Tariffs': Tariffs,
            '@models/Payments': Payments,
            '@models/SiteSettings': {},
            '@server/dbConnect': async () => {},
            '@server/getTenantContext': async () => context,
            '@server/personalTariffs': service,
            '@helpers/personalTariffs.mjs': access,
            '@server/billingRenewalState':
              await import('./billingRenewalState.js'),
            '@server/referralRewards': {
              retryPendingReferralRewards: async () => ({}),
            },
            '@server/telefonipBalance': {
              checkTelefonipBalance: async () => ({}),
            },
          })
          const req = () =>
            new Request('http://test/api/billing/renew', { method: 'POST' })
          assert.equal((await route.POST(req())).status, 200)
          assert.equal((await route.POST(req())).status, 200)
          assert.equal((await read(user._id)).balance, 800)
          assert.equal(
            await Payments.countDocuments({
              userId: user._id,
              tariffId: business._id,
            }),
            0
          )
          assert.equal(
            await Payments.countDocuments({
              userId: user._id,
              tariffId: bro._id,
            }),
            1
          )
        }
      )
      await t.test(
        'insufficient funds preserves proposal and retries after topup',
        async () => {
          let user = await fresh()
          await Users.updateOne({ _id: user._id }, { $set: { balance: 0 } })
          user = await read(user._id)
          await service.schedule({ user, tariff: bro, admin: true, now })
          await service.renewScheduled(end)
          let after = await read(user._id)
          assert.equal(String(after.tariffId), String(free._id))
          assert.equal(after.balance, 0)
          assert.ok(after.pendingTariffChange)
          await Users.updateOne({ _id: user._id }, { $set: { balance: 300 } })
          await service.renewScheduled(new Date('2026-10-21T00:00:00Z'))
          after = await read(user._id)
          assert.equal(after.balance, 100)
          assert.equal(String(after.tariffId), String(bro._id))
        }
      )
      await t.test(
        'revocation cancels selected proposal only; stale selection cannot beat revocation',
        async () => {
          let user = await fresh()
          user = (
            await service.schedule({ user, tariff: bro, admin: true, now })
          ).user
          const revoked = await service.grant({
            user,
            tariff: bro,
            enabled: false,
          })
          assert.ok(revoked.ok)
          assert.equal(revoked.user.pendingTariffChange, null)
          assert.equal(
            (
              await service.change({
                user,
                tariff: bro,
                scheduled: true,
                now: end,
              })
            ).ok,
            false
          )
          assert.equal((await read(user._id)).balance, 1000)
        }
      )
      await t.test(
        'cancel and replacement preserve paid period; free schedule requires no balance',
        async () => {
          let user = await fresh()
          user = (
            await service.schedule({ user, tariff: bro, admin: true, now })
          ).user
          user = (await service.schedule({ user, tariff: free, now })).user
          assert.equal(
            String(user.pendingTariffChange.tariffId),
            String(free._id)
          )
          user = (await service.cancel(user)).user
          assert.equal(user.pendingTariffChange, null)
          assert.equal(user.balance, 1000)
          await service.schedule({ user, tariff: free, now })
          await service.renewScheduled(end)
          const after = await read(user._id)
          assert.equal(after.balance, 1000)
          assert.equal(after.nextChargeAt, null)
        }
      )
      await t.test(
        'receipt failure recovers without charging twice',
        async () => {
          let user = await fresh()
          user = (
            await service.schedule({ user, tariff: bro, admin: true, now })
          ).user
          const broken = createPersonalTariffService({
            Users,
            Tariffs,
            Payments: {
              updateOne: async () => {
                throw new Error('ledger unavailable')
              },
            },
          })
          await assert.rejects(
            broken.change({ user, tariff: bro, scheduled: true, now: end }),
            /ledger unavailable/
          )
          assert.equal((await read(user._id)).balance, 800)
          await service.renewScheduled(end)
          assert.equal((await read(user._id)).balance, 800)
          assert.equal(
            await Payments.countDocuments({ userId: user._id, type: 'charge' }),
            1
          )
          assert.equal(
            (
              await Users.findById(user._id)
                .select('+pendingBillingReceipt')
                .lean()
            ).pendingBillingReceipt,
            null
          )
        }
      )
      await t.test(
        'immediate switch uses compensation, clears schedule and rejects injected tenant',
        async () => {
          let user = await fresh()
          user = (
            await service.schedule({ user, tariff: bro, admin: true, now })
          ).user
          const forged = { ...user, tenantId: new mongoose.Types.ObjectId() }
          assert.equal(
            (await service.change({ user: forged, tariff: bro, now })).ok,
            false
          )
          const results = await Promise.all([
            service.change({ user, tariff: bro, now }),
            service.change({ user, tariff: bro, now }),
          ])
          assert.equal(results.filter((x) => x.ok).length, 1)
          const after = await read(user._id)
          assert.equal(after.pendingTariffChange, null)
          assert.equal(after.balance, 900)
          assert.equal(await Payments.countDocuments({ userId: user._id }), 2)
        }
      )
    } finally {
      if (connection) await connection.close()
      child.kill()
      await exited
      const target = path.resolve(directory)
      assert.equal(path.dirname(target), path.resolve(os.tmpdir()))
      assert.ok(path.basename(target).startsWith('vedelo-personal-tariffs-'))
      await fs.rm(target, { recursive: true, force: true })
    }
  }
)
