const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const { spawn, spawnSync } = require('node:child_process')
const { once } = require('node:events')
const mongoose = require('mongoose')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const compile = (file, mocks = {}) => {
  const filename = path.resolve(file)
  const { code } = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    jsc: { parser: { syntax: 'ecmascript' } },
    module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => {
      if (name in mocks) return mocks[name]
      if (name.startsWith('@') || name.startsWith('.'))
        throw Error(`Unexpected import: ${name}`)
      return require(name)
    },
    mod,
    mod.exports
  )
  return mod.exports
}

const binary = process.env.MONGOD_BINARY || 'mongod'
const available =
  spawnSync(binary, ['--version'], { stdio: 'ignore', windowsHide: true })
    .status === 0
test(
  'referrals: real standalone Mongo, VK registration, races and failure recovery',
  {
    timeout: 60000,
    skip: available ? false : 'mongod unavailable',
  },
  async (t) => {
    // Never read .env or connect to the application database.
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'vedelo-referrals-')
    )
    const server = net.createServer()
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = server.address().port
    await new Promise((resolve) => server.close(resolve))
    const mongo = spawn(
      binary,
      ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port)],
      {
        stdio: 'ignore',
        windowsHide: true,
      }
    )
    const db = mongoose.createConnection(
      `mongodb://127.0.0.1:${port}/referral_test`,
      {
        retryWrites: false,
        serverSelectionTimeoutMS: 15000,
      }
    )
    try {
      await db.asPromise()
      await loadBindings()
      const usersSchema = compile('schemas/usersSchema.js', {
        '@helpers/constants': {
          DEFAULT_USERS_NOTIFICATIONS: {},
          DEFAULT_GOOGLE_CALENDAR_REMINDERS: {
            useDefault: true,
            overrides: [],
          },
        },
      }).default
      const Users = db.model('Users', new mongoose.Schema(usersSchema))
      const paymentsSchema = compile('schemas/paymentsSchema.js').default
      const Payments = compile('models/Payments.js', {
        mongoose: {
          Schema: mongoose.Schema,
          models: db.models,
          model: db.model.bind(db),
        },
        '@schemas/paymentsSchema': paymentsSchema,
      }).default
      await Payments.init() // Also verifies the real partial unique index on MongoDB 6.
      const SiteSettings = db.model(
        'SiteSettings',
        new mongoose.Schema({
          tenantId: mongoose.Schema.Types.ObjectId,
          referralProgram: { percent: Number },
        })
      )
      await SiteSettings.create({
        tenantId: null,
        referralProgram: { percent: 5 },
      })
      const rewards = compile('server/referralRewards.js')
      const models = {
        UsersModel: Users,
        PaymentsModel: Payments,
        SiteSettingsModel: SiteSettings,
      }
      const invite = async () => {
        const referrerId = new mongoose.Types.ObjectId()
        const referredId = new mongoose.Types.ObjectId()
        const otherId = new mongoose.Types.ObjectId()
        await Users.create([
          { _id: referrerId, tenantId: referrerId, balance: 100 },
          { _id: referredId, tenantId: referredId, referrerId, balance: 0 },
          { _id: otherId, tenantId: otherId, balance: 77 },
        ])
        const payment = await Payments.create({
          userId: referredId,
          tenantId: referredId,
          amount: 1000,
          type: 'topup',
          source: 'yookassa',
          purpose: 'balance',
          status: 'succeeded',
          referralRewardPending: true,
        })
        return { referrerId, referredId, otherId, payment }
      }
      const award = (payment, overrides = {}) =>
        rewards.createReferralRewardForBalanceTopup({
          payment,
          ...models,
          ...overrides,
        })
      const balance = async (id) => (await Users.findById(id)).balance

      await t.test(
        'concurrent rewards credit once, preserve tenants, and hide receipts from user payloads',
        async () => {
          const { payment, referrerId, otherId } = await invite()
          await Promise.all(Array.from({ length: 12 }, () => award(payment)))
          assert.equal(await balance(referrerId), 150)
          assert.equal(await balance(otherId), 77)
          assert.equal(
            await Payments.countDocuments({
              'referralReward.sourcePaymentId': payment._id,
            }),
            1
          )
          assert.equal(
            (await Payments.findById(payment._id)).referralRewardPending,
            false
          )
          assert.equal(
            (await Users.findById(referrerId).lean()).referralRewardCredits,
            undefined
          )
          assert.equal(
            (await award({ ...payment.toObject(), tenantId: otherId })).error,
            'payment_tenant_mismatch'
          )
          assert.equal(await balance(referrerId), 150)
        }
      )

      await t.test(
        'failure before balance write is retried using the original reward amount',
        async () => {
          const { payment, referrerId } = await invite()
          await assert.rejects(
            award(payment, {
              UsersModel: {
                findById: Users.findById.bind(Users),
                updateOne: async () => {
                  throw Error('write failed')
                },
              },
            }),
            /write failed/
          )
          const pending = await Payments.findOne({
            'referralReward.sourcePaymentId': payment._id,
          })
          assert.equal(pending.status, 'pending')
          assert.equal(await balance(referrerId), 100)
          await SiteSettings.updateOne(
            { tenantId: null },
            { $set: { 'referralProgram.percent': 9 } }
          )
          assert.deepEqual(await rewards.retryPendingReferralRewards(models), {
            completed: 1,
            failed: 0,
          })
          assert.equal(await balance(referrerId), 150)
          await SiteSettings.updateOne(
            { tenantId: null },
            { $set: { 'referralProgram.percent': 5 } }
          )
        }
      )

      await t.test(
        'uncertain balance acknowledgement and failed reward finalization cannot double-credit',
        async () => {
          for (const failure of ['balance-response', 'reward-status']) {
            const { payment, referrerId } = await invite()
            const overrides =
              failure === 'balance-response'
                ? {
                    UsersModel: {
                      findById: Users.findById.bind(Users),
                      updateOne: async (...args) => {
                        await Users.updateOne(...args)
                        throw Error('lost response')
                      },
                    },
                  }
                : {
                    PaymentsModel: {
                      findOne: Payments.findOne.bind(Payments),
                      create: Payments.create.bind(Payments),
                      updateOne: async () => {
                        throw Error('lost response')
                      },
                    },
                  }
            await assert.rejects(award(payment, overrides), /lost response/)
            assert.equal(await balance(referrerId), 150)
            await Promise.all(Array.from({ length: 5 }, () => award(payment)))
            assert.equal(await balance(referrerId), 150)
            assert.equal(
              (
                await Payments.findOne({
                  'referralReward.sourcePaymentId': payment._id,
                })
              ).status,
              'succeeded'
            )
          }
        }
      )

      await t.test(
        'pending or canceled source payments do not award money',
        async () => {
          const { payment, referrerId } = await invite()
          for (const status of ['pending', 'canceled', 'failed'])
            assert.equal(
              (await award({ ...payment.toObject(), status })).skipped,
              'payment_not_succeeded'
            )
          assert.equal(await balance(referrerId), 100)
          await Payments.updateOne(
            { _id: payment._id },
            { $set: { referralRewardPending: false } }
          )
        }
      )

      await t.test(
        'administrator deletion retains a receipt; pending awards cannot be deleted',
        async () => {
          const { payment, referrerId } = await invite()
          const admin = { _id: new mongoose.Types.ObjectId(), role: 'dev' }
          const { DELETE } = compile('app/api/payments/route.js', {
            '@server/dbConnect': async () => {},
            '@server/getTenantContext': async () => ({
              user: admin,
              tenantId: admin._id,
            }),
            '@models/Users': Users,
            '@models/Payments': Payments,
            '@models/SiteSettings': SiteSettings,
            '@server/referralRewards': rewards,
            '@server/mongoCapabilities': {
              supportsMongoTransactions: () => false,
            },
          })
          await assert.rejects(
            award(payment, {
              UsersModel: {
                findById: Users.findById.bind(Users),
                updateOne: async () => {
                  throw Error('fail')
                },
              },
            })
          )
          const reward = await Payments.findOne({
            'referralReward.sourcePaymentId': payment._id,
          })
          const remove = () =>
            DELETE(
              new Request('http://localhost/api/payments', {
                method: 'DELETE',
                body: JSON.stringify({ paymentId: reward._id }),
              })
            )
          assert.equal((await remove()).status, 409)
          await award(payment)
          assert.equal((await remove()).status, 200)
          assert.equal(await balance(referrerId), 100)
          assert.equal((await award(payment)).skipped, 'already_rewarded')
          assert.equal(await balance(referrerId), 100)
          assert.equal(
            await Payments.countDocuments({
              'referralReward.sourcePaymentId': payment._id,
            }),
            0
          )
        }
      )

      await t.test(
        'both providers retry failed referrals without reapplying source balance topup',
        async () => {
          for (const provider of ['yookassa', 'tochka']) {
            const { payment, referrerId, referredId } = await invite()
            payment.status = 'pending'
            payment.source = provider
            payment.referralRewardPending = false
            await payment.save()
            let fail = true
            const fn = compile(`server/${provider}PaymentProcessing.js`, {
              '@models/Users': Users,
              '@models/Payments': Payments,
              '@models/SiteSettings': SiteSettings,
              '@server/billing': {
                applyTariffPurchase: async () => ({ ok: true }),
              },
              '@server/billingConfig': { getSbpBonusAmount: () => 0 },
              '@server/acquisitionFunnel': {
                recordPaymentSucceeded: async () => {},
              },
              '@server/referralRewards': {
                createReferralRewardForBalanceTopup: async (args) => {
                  if (fail) throw Error('test failure')
                  return rewards.createReferralRewardForBalanceTopup(args)
                },
              },
              [`@server/${provider}`]: {
                normalizeAmount: (value) => Number(value).toFixed(2),
              },
            })[
              provider === 'yookassa'
                ? 'processSucceededYookassaPayment'
                : 'processSucceededTochkaPayment'
            ]
            const providerPayment = {
              status: provider === 'yookassa' ? 'succeeded' : 'APPROVED',
              amount: { value: '1000.00', currency: 'RUB' },
            }
            const log = console.error
            try {
              console.error = () => {}
              await fn({ payment, providerPayment })
            } finally {
              console.error = log
            }
            assert.equal(await balance(referredId), 1000)
            assert.equal(await balance(referrerId), 100)
            assert.equal(
              (await Payments.findById(payment._id)).referralRewardPending,
              true
            )
            fail = false
            await fn({
              payment: await Payments.findById(payment._id),
              providerPayment,
            })
            await fn({
              payment: await Payments.findById(payment._id),
              providerPayment,
            })
            assert.equal(await balance(referredId), 1000)
            assert.equal(await balance(referrerId), 150)
          }
        }
      )

      await t.test(
        'real VK route creates referrals only for new users and ignores invalid IDs',
        async () => {
          const referrer = await Users.create({ balance: 0 })
          let phone = '79000000001'
          const phones = {
            findUserByPhone: (value) => Users.findOne({ phone: value }),
            normalizePhone: String,
            isValidNormalizedPhone: (value) => /^7\d{10}$/.test(value),
          }
          const { ensureVkUser } = compile('server/ensureVkUser.js', {
            '@models/Users': Users,
            '@server/phoneVerification': phones,
            '@server/registrationTrial': {
              buildRegistrationTrialUserFields: async () => ({}),
            },
            '@server/registrationNotifications': {
              notifyDevelopersAboutNewUser: async () => {},
            },
            '@helpers/legalDocuments.mjs': {
              buildLegalAcceptanceFields: () => ({
                consentTermsAccepted: true,
              }),
            },
          })
          const { POST } = compile('app/api/vk-id/auth/route.js', {
            '@server/dbConnect': async () => {},
            '@server/ensureVkUser': { ensureVkUser },
            '@server/vkIdAuth': {
              fetchVkUserInfo: async () => ({
                success: true,
                data: { vkId: phone, phone },
              }),
            },
            '@server/vkidAuthToken': {
              createVkIdAuthToken: () => 'test-token',
            },
            '@server/getAuthSecret': () => 'test-secret',
            '@server/phoneVerification': phones,
            '@server/rateLimit': { checkRateLimit: async () => ({ ok: true }) },
            '@helpers/registrationSource.mjs': {
              getRegistrationSourceFromRequest: () => '',
              getAcquisitionFromRequest: () => null,
            },
          })
          const post = (body) =>
            POST(
              new Request('http://localhost/api/vk-id/auth', {
                method: 'POST',
                body: JSON.stringify({ accessToken: 'mock', ...body }),
              })
            )
          const register = {
            mode: 'register',
            referrerId: String(referrer._id),
            consentTerms: true,
            consentPrivacyPolicy: true,
            consentPersonalData: true,
          }
          assert.equal(
            (await post({ ...register, consentTerms: false })).status,
            400
          )
          assert.equal(await Users.findOne({ phone }), null)
          assert.equal((await post(register)).status, 200)
          let user = await Users.findOne({ phone })
          assert.equal(String(user.referrerId), String(referrer._id))
          const payment = await Payments.create({
            userId: user._id,
            tenantId: user.tenantId,
            amount: 1000,
            type: 'topup',
            source: 'yookassa',
            status: 'succeeded',
          })
          await award(payment)
          assert.equal(await balance(referrer._id), 50)
          await Users.updateOne(
            { _id: user._id },
            { $set: { referrerId: null } }
          )
          for (const mode of ['login', 'register']) {
            assert.equal((await post({ ...register, mode })).status, 200)
            assert.equal((await Users.findById(user._id)).referrerId, null)
          }
          for (const invalid of [
            'bad-id',
            String(new mongoose.Types.ObjectId()),
          ]) {
            phone = String(Number(phone) + 1)
            assert.equal(
              (await post({ ...register, referrerId: invalid })).status,
              200
            )
            user = await Users.findOne({ phone })
            assert.equal(user.referrerId, null)
          }
        }
      )
      await t.test(
        'adding a phone password cannot attach an existing VK account as a new referral',
        async () => {
          const referrer = await Users.create({ balance: 0 })
          const { POST } = compile('app/api/phone/verify/finalize/route.js', {
            '@server/dbConnect': async () => {},
            '@models/Users': Users,
            '@models/PhoneConfirms': {
              findOne: async () => ({
                confirmed: true,
                expiresAt: new Date(Date.now() + 60000),
              }),
              deleteMany: async () => {},
            },
            '@server/registrationTrial': {
              buildRegistrationTrialUserFields: async () => ({}),
            },
            '@server/registrationNotifications': {
              notifyDevelopersAboutNewUser: async () => {},
            },
            '@server/phoneVerification': {
              findUserByPhone: (phone) => Users.findOne({ phone }),
              normalizePhone: String,
              isValidNormalizedPhone: () => true,
              validateFlow: () => true,
            },
            '@server/rateLimit': { checkRateLimit: async () => ({ ok: true }) },
            '@helpers/registrationSource.mjs': {
              getRegistrationSourceFromRequest: () => '',
              getAcquisitionFromRequest: () => null,
            },
            '@helpers/legalDocuments.mjs': {
              buildLegalAcceptanceFields: () => ({
                consentTermsAccepted: true,
              }),
            },
          })
          for (const [index, profile] of [
            { registrationType: 'vk', vkId: 'existing-vk' },
            { registrationType: 'phone' },
          ].entries()) {
            const phone = String(79000000010 + index)
            const user = await Users.create({ phone, password: '', ...profile })
            const response = await POST(
              new Request('http://localhost/api/phone/verify/finalize', {
                method: 'POST',
                body: JSON.stringify({
                  phone,
                  password: 'Password123!',
                  flow: 'register',
                  referrerId: referrer._id,
                  consentTerms: true,
                  consentPrivacyPolicy: true,
                  consentPersonalData: true,
                }),
              })
            )
            assert.equal(response.status, 200)
            const saved = await Users.findById(user._id)
            assert.ok(saved.password)
            assert.equal(
              String(saved.referrerId),
              index === 0 ? 'null' : String(referrer._id)
            )
          }
        }
      )

      await t.test(
        'referral API excludes pending bonuses and rejects foreign/admin access',
        async () => {
          const { payment, referrerId, otherId } = await invite()
          await assert.rejects(
            award(payment, {
              UsersModel: {
                findById: Users.findById.bind(Users),
                updateOne: async () => {
                  throw Error('fail')
                },
              },
            })
          )
          let user = null
          const summary = compile('server/referralSummary.js', {
            './referralRewards.js': rewards,
          })
          const { GET } = compile('app/api/referrals/route.js', {
            '@models/Users': Users,
            '@models/Payments': Payments,
            '@server/dbConnect': async () => {},
            '@server/getRequestContext': async () => ({ user }),
            '@server/referralSummary': summary,
            '@server/referralRewards': rewards,
          })
          const get = (query = '') =>
            GET(new Request('http://localhost/api/referrals' + query))
          assert.equal((await get()).status, 401)
          user = { _id: referrerId, tenantId: referrerId, role: 'user' }
          assert.equal((await get('?scope=admin')).status, 403)
          const result = await (
            await get(`?userId=${otherId}&tenantId=${otherId}`)
          ).json()
          assert.equal(result.data.referralsCount, 1)
          assert.equal(result.data.rewardsTotal, 0)
          await award(payment)
          assert.equal((await (await get()).json()).data.rewardsTotal, 50)
        }
      )
    } finally {
      await db.close().catch(() => {})
      if (mongo.exitCode === null) {
        const exited = once(mongo, 'exit')
        mongo.kill()
        await exited
      }
      // Only the freshly created temporary database directory is removed.
      assert.ok(
        path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)
      )
      await fs.rm(directory, { recursive: true, force: true })
    }
  }
)
