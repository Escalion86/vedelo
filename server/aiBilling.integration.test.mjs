import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { once } from 'node:events'

const require = createRequire(import.meta.url)
const { createLoader } = require('../tests/server/loadWithAliases.cjs')

const binary = process.env.MONGOD_BINARY || 'mongod'
const available =
  spawnSync(binary, ['--version'], { stdio: 'ignore', windowsHide: true })
    .status === 0

const freePort = async () => {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

test(
  'ИИ по тарифу: в пределах лимита месяца платит платформа, сверх — баланс',
  { skip: available ? false : 'mongod unavailable', timeout: 240000 },
  async (t) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'vedelo-ai-billing-'))
    const port = await freePort()
    const mongo = spawn(
      binary,
      ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port)],
      { stdio: 'ignore', windowsHide: true }
    )
    t.after(async () => {
      try {
        mongo.kill()
      } catch {}
      await rm(directory, { recursive: true, force: true })
    })

    const uri = `mongodb://127.0.0.1:${port}`
    const dbName = 'vedelo_ai_billing_test'
    process.env.AITUNNEL_KEY ||= 'test-key'
    const mongoose = require('mongoose')
    const connect = async () => {
      if (mongoose.connection.readyState !== 1)
        await mongoose.connect(uri, {
          dbName,
          retryWrites: false,
          serverSelectionTimeoutMS: 20000,
        })
      return mongoose.connection
    }

    const { load } = await createLoader({
      '@server/dbConnect': { __esModule: true, default: connect },
    })
    const billing = load('server/aiBilling.js')
    const { default: Users } = load('models/Users.js')
    const { default: Tariffs } = load('models/Tariffs.js')
    const { default: AiUsage } = load('models/AiUsage.js')
    const { default: Payments } = load('models/Payments.js')
    const { default: SiteSettings } = load('models/SiteSettings.js')

    try {
      await connect()
      await SiteSettings.create({
        tenantId: null,
        aiBilling: { markupCoefficient: 1.5 },
      })
      const includedTariff = await Tariffs.create({
        title: 'Профи',
        price: 990,
        allowAi: true,
        aiIncludedRubPerMonth: 1,
      })
      const plainTariff = await Tariffs.create({
        title: 'Старт',
        price: 490,
        allowAi: true,
        aiIncludedRubPerMonth: 0,
      })
      const covered = await Users.create({
        balance: 0,
        tariffId: includedTariff._id,
        phone: '+79000000001',
        email: 'covered@vedelo.test',
      })
      const plain = await Users.create({
        balance: 0,
        tariffId: plainTariff._id,
        phone: '+79000000002',
        email: 'plain@vedelo.test',
      })
      const coveredTenantId = String(covered._id)
      const plainTenantId = String(plain._id)

      const initial = await billing.getTenantAiIncludedState({
        tenantId: coveredTenantId,
      })
      assert.equal(initial.enabled, true)
      assert.equal(initial.includedRub, 1)
      assert.equal(initial.usedRub, 0)
      assert.equal(initial.remainingRub, 1)
      assert.equal(initial.coveredByTariff, true)

      const quote = await billing.getPlatformAiAccessQuote({
        tenantId: coveredTenantId,
        feature: 'event_draft',
      })
      assert.equal(quote.balanceRub, 0)
      assert.equal(
        quote.available,
        true,
        'нулевой баланс не мешает, пока лимит тарифа не исчерпан'
      )
      assert.equal(quote.tariffIncluded.coveredByTariff, true)

      const plainQuote = await billing.getPlatformAiAccessQuote({
        tenantId: plainTenantId,
        feature: 'event_draft',
      })
      assert.equal(plainQuote.available, false, 'без лимита нужен баланс')
      assert.equal(plainQuote.tariffIncluded.enabled, false)

      const reservation = await billing.reservePlatformAiUsage({
        tenantId: coveredTenantId,
        feature: 'event_draft',
        model: 'gpt-4o-mini',
      })
      assert.equal(reservation.coveredByTariff, true)
      assert.equal(reservation.reserveKopecks, 0)
      assert.equal(
        Number(
          (await Users.findById(coveredTenantId).select('balance').lean()).balance
        ),
        0,
        'баланс пользователя не тронут'
      )

      const settled = await billing.settlePlatformAiUsage(reservation, {
        cost_rub: 0.4,
        total_tokens: 120,
      })
      assert.equal(settled.status, 'succeeded')
      assert.equal(settled.chargedKopecks, 0)
      assert.equal(settled.providerCostMicrorubles, 400000)
      assert.equal(settled.coveredByTariff, true)
      assert.equal(
        await Payments.countDocuments({
          tenantId: coveredTenantId,
          purpose: 'ai',
        }),
        0,
        'за запрос по тарифу платёж с баланса не создаётся'
      )

      const afterFirst = await billing.getTenantAiIncludedState({
        tenantId: coveredTenantId,
      })
      assert.equal(afterFirst.usedRub, 0.4)
      assert.equal(afterFirst.remainingRub, 0.6)
      assert.equal(afterFirst.coveredByTariff, true)

      for (const costRub of [0.4, 0.4]) {
        const next = await billing.reservePlatformAiUsage({
          tenantId: coveredTenantId,
          feature: 'event_draft',
        })
        assert.equal(next.coveredByTariff, true)
        await billing.settlePlatformAiUsage(next, { cost_rub: costRub })
      }
      const exhausted = await billing.getTenantAiIncludedState({
        tenantId: coveredTenantId,
      })
      assert.equal(exhausted.usedRub, 1.2, 'перерасход записан в расход месяца')
      assert.equal(exhausted.remainingRub, 0)
      assert.equal(exhausted.coveredByTariff, false)

      const exhaustedQuote = await billing.getPlatformAiAccessQuote({
        tenantId: coveredTenantId,
        feature: 'event_draft',
      })
      assert.equal(exhaustedQuote.available, false)
      await assert.rejects(
        billing.reservePlatformAiUsage({
          tenantId: coveredTenantId,
          feature: 'event_draft',
        }),
        (error) => {
          assert.equal(error.code, 'AI_BALANCE_INSUFFICIENT')
          assert.equal(error.tariffLimitExhausted, true)
          return true
        }
      )

      await Users.updateOne({ _id: coveredTenantId }, { $set: { balance: 5 } })
      const paidReservation = await billing.reservePlatformAiUsage({
        tenantId: coveredTenantId,
        feature: 'event_draft',
      })
      assert.equal(paidReservation.coveredByTariff, false)
      assert.ok(paidReservation.reserveKopecks > 0)
      const afterReserve = Number(
        (await Users.findById(coveredTenantId).select('balance').lean()).balance
      )
      assert.ok(afterReserve < 5, 'сверх лимита резерв идёт с баланса')

      const paid = await billing.settlePlatformAiUsage(paidReservation, {
        cost_rub: 1,
      })
      assert.equal(paid.chargedKopecks, 150, '1 ₽ × 1,5 = 150 копеек')
      assert.equal(paid.coveredByTariff, false)
      assert.equal(
        await Payments.countDocuments({
          tenantId: coveredTenantId,
          purpose: 'ai',
        }),
        1
      )
      const balanceAfterPaid = Number(
        (await Users.findById(coveredTenantId).select('balance').lean()).balance
      )
      assert.equal(Math.round((5 - balanceAfterPaid) * 100), 150)

      const balanceBeforePaidReserve = Number(
        (await Users.findById(coveredTenantId).select('balance').lean()).balance
      )
      const failedReservation = await billing.reservePlatformAiUsage({
        tenantId: coveredTenantId,
        feature: 'event_draft',
      })
      assert.ok(
        Number(
          (await Users.findById(coveredTenantId).select('balance').lean()).balance
        ) < balanceBeforePaidReserve
      )
      await billing.failPlatformAiUsage(failedReservation)
      const balanceAfterFail = Number(
        (await Users.findById(coveredTenantId).select('balance').lean()).balance
      )
      assert.ok(
        Math.abs(balanceAfterFail - balanceBeforePaidReserve) < 1e-6,
        `неудачный запрос возвращает резерв с баланса (${balanceAfterFail} ≠ ${balanceBeforePaidReserve})`
      )
      const failedUsage = await AiUsage.findById(failedReservation.usageId).lean()
      assert.equal(failedUsage.status, 'failed')

      const coveredUsage = await AiUsage.find({
        tenantId: coveredTenantId,
        coveredByTariff: true,
      }).lean()
      assert.equal(coveredUsage.length, 3)
      assert.ok(coveredUsage.every((item) => item.chargedKopecks === 0))
      assert.equal(coveredUsage[0].markupCoefficient, 1.5)
    } finally {
      await mongoose.connection.dropDatabase()
      await mongoose.connection.close()
      mongoose.models = {}
    }
  }
)
