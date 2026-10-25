const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
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
      throw new Error(name)
    },
    loaded,
    loaded.exports
  )
  return loaded.exports
}

test(
  'promocodes: real standalone MongoDB, money, grants, recovery and API isolation',
  { timeout: 90000 },
  async (t) => {
    await loadBindings()
    const { createPromoCodeService, promoCodeKey } =
      await import('../../server/promoCodeService.mjs')
    const { validatePromoCode } = await import('../../helpers/promoCodes.mjs')
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vedelo-promos-'))
    const probe = net.createServer()
    await new Promise((r) => probe.listen(0, '127.0.0.1', r))
    const port = probe.address().port
    await new Promise((r) => probe.close(r))
    const child = spawn(
      process.env.PROMO_TEST_MONGOD || 'mongod',
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
        .createConnection(`mongodb://127.0.0.1:${port}/promos_test`, {
          serverSelectionTimeoutMS: 30000,
        })
        .asPromise()
      const userSchema = (
        await load('schemas/usersSchema.js', {
          mongoose,
          '@helpers/constants': {
            DEFAULT_GOOGLE_CALENDAR_REMINDERS: { overrides: [] },
            DEFAULT_USERS_NOTIFICATIONS: {},
          },
          '@helpers/maxContact': { isValidMaxContact: () => true },
        })
      ).default
      const Users = connection.model('Users', new mongoose.Schema(userSchema))
      const Tariffs = connection.model(
        'Tariffs',
        new mongoose.Schema(
          (await import('../../schemas/tariffsSchema.js')).default
        )
      )
      const Payments = connection.model(
        'Payments',
        new mongoose.Schema(
          (await import('../../schemas/paymentsSchema.js')).default,
          { timestamps: true }
        )
      )
      const PromoCodes = (
        await load('models/PromoCodes.js', {
          mongoose: {
            Schema: mongoose.Schema,
            models: {},
            model: (name, schema) => connection.model(name, schema),
          },
        })
      ).default
      await Promise.all([
        Users.init(),
        Tariffs.init(),
        Payments.init(),
        PromoCodes.init(),
      ])
      const service = createPromoCodeService({
        Users,
        Tariffs,
        Payments,
        PromoCodes,
      })
      const bro = await Tariffs.create({
        title: 'BRO',
        price: 500,
        hidden: true,
      })
      const other = await Tariffs.create({
        title: 'SECRET',
        price: 100,
        hidden: true,
      })
      const fresh = async () => {
        const _id = new mongoose.Types.ObjectId()
        return (
          await Users.create({ _id, tenantId: _id, balance: 10 })
        ).toObject()
      }
      const offer = (code, extra = {}) => ({
        code,
        amount: 25.5,
        tariffId: String(bro._id),
        expiresAt: '2099-10-31T23:59:59Z',
        enabled: true,
        comment: 'Private admin comment',
        ...extra,
      })
      const redeem = (user, code) =>
        service.redeem({ user, tenantId: user.tenantId || user._id, code })
      await t.test(
        'validation rejects injection, invalid amount/date, empty benefit',
        async () => {
          for (const change of [
            { code: { $ne: '' } },
            { amount: -1 },
            { amount: Infinity },
            { amount: 0.001 },
            { amount: '50' },
            { expiresAt: '' },
            { tariffId: { $ne: null } },
            { amount: 0, tariffId: null },
          ])
            assert.ok(validatePromoCode(offer('FOCUS', change)).error)
          assert.equal(
            (
              await service.save(
                offer('PUBLIC', {
                  tariffId: String(
                    (await Tariffs.create({ title: 'Public' }))._id
                  ),
                })
              )
            ).ok,
            false
          )
        }
      )
      await t.test(
        'create, duplicate, optimistic edit and immutable code identity',
        async () => {
          assert.equal((await service.save(offer('focus'))).ok, true)
          assert.equal((await service.save(offer(' FOCUS '))).status, 409)
          assert.equal(
            (await service.save({ ...offer('FOCUS'), revision: 0 })).ok,
            true
          )
          assert.equal(
            (await service.save({ ...offer('FOCUS'), revision: 0 })).status,
            409
          )
        }
      )
      await t.test(
        '20 parallel attempts give one bonus and one specific grant',
        async () => {
          const user = await fresh()
          const results = await Promise.all(
            Array.from({ length: 20 }, () => redeem(user, ' focus '))
          )
          assert.ok(results.every((r) => r.ok))
          assert.equal(results.filter((r) => !r.data.alreadyUsed).length, 1)
          const current = await Users.findById(user._id).lean()
          assert.equal(current.balance, 35.5)
          assert.deepEqual(current.allowedTariffIds.map(String), [
            String(bro._id),
          ])
          assert.equal(current.tariffId, null)
          assert.equal(current.promoRedemptions, undefined)
          assert.equal(await Payments.countDocuments({ userId: user._id }), 1)
          assert.equal(JSON.stringify(results).includes('Private admin'), false)
          assert.equal(
            (await redeem(await fresh(), 'FOCUS')).data.alreadyUsed,
            false
          )
        }
      )
      await t.test(
        'tenant forgery and archived users cannot redeem',
        async () => {
          const user = await fresh(),
            alien = new mongoose.Types.ObjectId()
          assert.equal(
            (await service.redeem({ user, tenantId: alien, code: 'FOCUS' }))
              .status,
            403
          )
          assert.equal(
            (
              await service.redeem({
                user: { ...user, tenantId: alien },
                tenantId: alien,
                code: 'FOCUS',
              })
            ).status,
            403
          )
          await Users.updateOne(
            { _id: user._id, tenantId: user.tenantId },
            { archive: true }
          )
          assert.equal((await redeem(user, 'FOCUS')).status, 403)
          assert.equal((await Users.findById(user._id)).balance, 10)
        }
      )
      await t.test(
        'expired/disabled/missing and deleted hidden tariff are rejected',
        async () => {
          const user = await fresh()
          await service.save(
            offer('EXPIRED', { expiresAt: '2020-01-01T00:00:00Z' })
          )
          await service.save(offer('DISABLED', { enabled: false }))
          await service.save(offer('REMOVED', { tariffId: String(other._id) }))
          await Tariffs.deleteOne({ _id: other._id })
          for (const code of ['EXPIRED', 'DISABLED', 'MISSING', 'REMOVED'])
            assert.equal((await redeem(user, code)).ok, false)
          assert.equal((await Users.findById(user._id)).balance, 10)
        }
      )
      await t.test(
        'ledger failure recovers after expiry/edit, using original receipt',
        async () => {
          const user = await fresh()
          await service.save(offer('RECOVERY'))
          const broken = createPromoCodeService({
            Users,
            Tariffs,
            PromoCodes,
            Payments: {
              updateOne: async () => {
                throw new Error('offline')
              },
            },
          })
          await assert.rejects(
            broken.redeem({ user, tenantId: user.tenantId, code: 'RECOVERY' })
          )
          await service.save({
            ...offer('RECOVERY', {
              amount: 999,
              enabled: false,
              expiresAt: '2020-01-01T00:00:00Z',
            }),
            revision: 0,
          })
          const result = await redeem(user, 'RECOVERY')
          assert.equal(result.data.alreadyUsed, true)
          assert.equal(result.data.amount, 25.5)
          assert.equal((await Users.findById(user._id)).balance, 35.5)
          assert.equal(await Payments.countDocuments({ userId: user._id }), 1)
          const payment = await Payments.findOne({ userId: user._id })
          assert.equal(payment.source, 'system')
          assert.equal(payment.comment, 'Бонус по промокоду RECOVERY')
        }
      )
      await t.test(
        'balance-only, grant-only and legacy tenant work',
        async () => {
          await service.save(offer('MONEY', { tariffId: null }))
          await service.save(offer('ACCESS', { amount: 0 }))
          const user = (await Users.create({ balance: 0 })).toObject()
          assert.equal((await redeem(user, 'MONEY')).ok, true)
          assert.equal((await redeem(user, 'ACCESS')).ok, true)
          assert.equal((await Users.findById(user._id)).balance, 25.5)
          assert.equal(
            await Payments.countDocuments({
              userId: user._id,
              tenantId: user._id,
            }),
            1
          )
          assert.ok(
            (await Users.findById(user._id).select('+promoRedemptions'))
              .promoRedemptions[promoCodeKey('ACCESS')]
          )
        }
      )
      await t.test(
        'usage reports, original history, and deletion of unused codes only',
        async () => {
          await service.save(offer('UNUSED'))
          assert.equal(
            (await service.list()).find((r) => r.code === 'UNUSED').canDelete,
            true
          )
          assert.equal(
            (await service.remove({ code: 'UNUSED', revision: 1 })).status,
            409
          )
          assert.equal(
            (await service.remove({ code: 'UNUSED', revision: 0 })).ok,
            true
          )
          assert.equal(
            await PromoCodes.exists({ _id: promoCodeKey('UNUSED') }),
            null
          )
          assert.equal((await redeem(await fresh(), 'UNUSED')).ok, false)
          const user = await fresh()
          await service.save(offer('HISTORY'))
          await redeem(user, 'HISTORY')
          await redeem(user, 'HISTORY')
          await Users.updateOne(
            { _id: user._id, tenantId: user.tenantId },
            { archive: true }
          )
          const row = (await service.list()).find((r) => r.code === 'HISTORY')
          assert.equal(row.usageCount, 1)
          assert.equal(row.canDelete, false)
          assert.equal(
            (await service.remove({ code: 'HISTORY', revision: 0 })).status,
            409
          )
          assert.equal((await PromoCodes.findById(row._id)).deleting, false)
          const usages = await service.usages('HISTORY')
          assert.equal(usages.data.users.length, 1)
          assert.equal(String(usages.data.users[0]._id), String(user._id))
          assert.equal(usages.data.users[0].archive, true)
          assert.equal(usages.data.users[0].promoRedemptions, undefined)
          const history = await service.userHistory(String(user._id))
          assert.equal(history.data[0].code, 'HISTORY')
          assert.equal(history.data[0].amount, 25.5)
          assert.equal(history.data[0].revision, undefined)
          assert.equal((await service.userHistory('bad')).status, 400)
          assert.equal(
            (await service.userHistory(String(new mongoose.Types.ObjectId())))
              .status,
            404
          )
        }
      )
      await t.test(
        'activation and deletion exclude each other atomically',
        async () => {
          await service.save(offer('RACING'))
          const user = await fresh()
          let started, resume
          const reached = new Promise((resolve) => {
            started = resolve
          })
          const wait = new Promise((resolve) => {
            resume = resolve
          })
          const paused = createPromoCodeService({
            Users: {
              findOne: (...args) => Users.findOne(...args),
              updateOne: async (...args) => {
                started()
                await wait
                return Users.updateOne(...args)
              },
            },
            PromoCodes,
            Tariffs,
            Payments,
          })
          const pending = paused.redeem({
            user,
            tenantId: user.tenantId,
            code: 'RACING',
          })
          await reached
          try {
            assert.equal(
              (await service.remove({ code: 'RACING', revision: 0 })).status,
              409
            )
          } finally {
            resume()
          }
          assert.equal((await pending).ok, true)
          assert.equal(
            (await PromoCodes.findById(promoCodeKey('RACING')))
              .activeRedemptions,
            0
          )
          assert.equal(
            (await service.remove({ code: 'RACING', revision: 0 })).status,
            409
          )
          await service.save(offer('DELETEFIRST'))
          await PromoCodes.updateOne(
            { _id: promoCodeKey('DELETEFIRST') },
            { deleting: true }
          )
          assert.equal((await redeem(await fresh(), 'DELETEFIRST')).ok, false)
        }
      )
      await t.test(
        'pagination preserves unique users and legacy codes can be deleted',
        async () => {
          await service.save(offer('PAGED'))
          const key = promoCodeKey('PAGED')
          await Users.insertMany(
            Array.from({ length: 51 }, () => {
              const _id = new mongoose.Types.ObjectId()
              return {
                _id,
                tenantId: _id,
                promoRedemptions: {
                  [key]: {
                    code: 'PAGED',
                    amount: 25.5,
                    appliedAt: new Date(),
                    tariffTitle: 'BRO',
                  },
                },
              }
            })
          )
          const first = (await service.usages('PAGED')).data
          const second = (await service.usages('PAGED', 1)).data
          assert.equal(first.users.length, 50)
          assert.equal(first.hasMore, true)
          assert.equal(second.users.length, 1)
          assert.equal(second.hasMore, false)
          assert.equal(
            new Set([...first.users, ...second.users].map((u) => String(u._id)))
              .size,
            51
          )
          assert.equal(
            (await service.list()).find((r) => r.code === 'PAGED').usageCount,
            51
          )
          await service.save(offer('LEGACYDELETE'))
          await PromoCodes.updateOne(
            { _id: promoCodeKey('LEGACYDELETE') },
            { $unset: { activeRedemptions: 1, deleting: 1 } }
          )
          assert.equal(
            (await service.remove({ code: 'LEGACYDELETE', revision: 0 })).ok,
            true
          )
        }
      )
      await t.test(
        'actual API routes: unauthenticated, roles, impersonation, payload substitution',
        async () => {
          let context = {}
          const common = {
            'next/server': {
              NextResponse: { json: (body, init) => Response.json(body, init) },
            },
            '@server/dbConnect': async () => {},
            '@server/promoCodes': service,
          }
          const admin = await load('app/api/admin/promo-codes/route.js', {
            ...common,
            '@server/getTenantContext': async () => context,
            '@models/PromoCodes': PromoCodes,
          })
          const route = await load('app/api/promo-codes/redeem/route.js', {
            ...common,
            '@server/getRequestContext': async () => context,
            '@server/rateLimit': { checkRateLimit: async () => ({ ok: true }) },
          })
          const request = (body) =>
            new Request('http://localhost/api', {
              method: 'POST',
              body: JSON.stringify(body),
            })
          assert.equal((await admin.GET()).status, 403)
          assert.equal(
            (await route.POST(request({ code: 'FOCUS' }))).status,
            401
          )
          const user = await fresh()
          context = { user, tenantId: user.tenantId }
          assert.equal((await admin.GET()).status, 403)
          assert.equal(
            (await admin.DELETE(request({ code: 'FOCUS', revision: 1 })))
              .status,
            403
          )
          assert.equal(
            (await admin.GET(new Request(`http://localhost/api?code=FOCUS`)))
              .status,
            403
          )
          assert.equal(
            (
              await admin.GET(
                new Request(`http://localhost/api?userId=${user._id}`)
              )
            ).status,
            403
          )
          assert.equal((await admin.POST(request(offer('FORGED')))).status, 403)
          assert.equal(
            (
              await route.POST(
                request({ code: 'FOCUS', tenantId: String(bro._id) })
              )
            ).status,
            400
          )
          context.user = { ...user, role: 'admin' }
          assert.equal((await admin.GET()).status, 200)
          assert.equal(
            (await admin.GET(new Request(`http://localhost/api?code=FOCUS`)))
              .status,
            200
          )
          assert.equal(
            (
              await admin.GET(
                new Request(`http://localhost/api?userId=${user._id}`)
              )
            ).status,
            200
          )
          context.user.impersonation = { active: true }
          assert.equal((await admin.GET()).status, 403)
          assert.equal(
            (await admin.DELETE(request({ code: 'FOCUS', revision: 1 })))
              .status,
            403
          )
          assert.equal(
            (
              await admin.GET(
                new Request(`http://localhost/api?userId=${user._id}`)
              )
            ).status,
            403
          )
          delete context.user.impersonation
          assert.equal(
            (await route.POST(request({ code: 'FOCUS' }))).status,
            200
          )
        }
      )
    } finally {
      if (connection) await connection.close()
      child.kill()
      await exited
      assert.equal(
        path.dirname(path.resolve(directory)),
        path.resolve(os.tmpdir())
      )
      assert.ok(path.basename(directory).startsWith('vedelo-promos-'))
      await fs.rm(directory, { recursive: true, force: true })
    }
  }
)
