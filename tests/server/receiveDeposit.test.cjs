const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const mongoose = require('mongoose')
const { NextRequest, NextResponse } = require('next/server')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const load = (file, mocks) => {
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => {
      if (!(name in mocks)) throw Error(name)
      return mocks[name]
    },
    loaded,
    loaded.exports
  )
  return loaded.exports
}

test(
  'receive deposit: Mongo persistence, retries, draft confirmation and tenant isolation',
  {
    skip: !process.env.DEPOSIT_TEST_MONGOD,
    timeout: 90000,
  },
  async (t) => {
    await loadBindings()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedelo-deposit-'))
    const probe = net.createServer()
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const port = probe.address().port
    await new Promise((resolve) => probe.close(resolve))
    const child = spawn(
      process.env.DEPOSIT_TEST_MONGOD,
      [
        '--dbpath',
        dir,
        '--bind_ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--quiet',
      ],
      { stdio: 'ignore', windowsHide: true }
    )
    const exited = once(child, 'exit')
    try {
      await mongoose.connect(`mongodb://127.0.0.1:${port}/deposit_test`, {
        serverSelectionTimeoutMS: 30000,
      })
      const O = mongoose.Schema.Types.ObjectId
      const Events = mongoose.model(
        'DepositTestEvents',
        new mongoose.Schema(
          {
            tenantId: O,
            clientId: O,
            status: String,
            eventDate: Date,
            waitDeposit: Boolean,
            depositDueAt: Date,
            depositExpectedAmount: Number,
            syncVersion: { type: Number, default: 1 },
          },
          { timestamps: true }
        )
      )
      const Clients = mongoose.model(
        'DepositTestClients',
        new mongoose.Schema({ tenantId: O })
      )
      const schema = load('schemas/transactionsSchema.js', { mongoose }).default
      const Transactions = load('models/Transactions.js', {
        mongoose,
        '@schemas/transactionsSchema': schema,
      }).default
      const tenantId = String(new mongoose.Types.ObjectId())
      const otherTenant = String(new mongoose.Types.ObjectId())
      let context = { tenantId, user: { _id: tenantId } }
      const route = load('app/api/events/[id]/deposit/route.js', {
        'node:crypto': require('node:crypto'),
        mongoose,
        'next/server': { NextResponse, after: () => {} },
        '@models/Events': Events,
        '@models/Transactions': Transactions,
        '@models/Clients': Clients,
        '@server/dbConnect': async () => {},
        '@server/getRequestContext': async () => context,
        '@server/activityHistory': { recordActivityHistory: async () => {} },
        '@server/CRUD': { updateEventInCalendar: async () => {} },
      })
      const client = await Clients.create({ tenantId })
      const createEvent = (extra = {}) =>
        Events.create({
          tenantId,
          clientId: client._id,
          status: 'draft',
          eventDate: new Date('2026-12-01'),
          waitDeposit: true,
          depositExpectedAmount: 15000,
          ...extra,
        })
      const post = (event, body = { amount: 12000, paymentMethod: 'cash' }) =>
        route.POST(
          new NextRequest('http://localhost/api/events/id/deposit', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          { params: Promise.resolve({ id: String(event._id) }) }
        )

      await t.test(
        'records edited amount/category/method and confirms draft once',
        async () => {
          const event = await createEvent()
          const first = await post(event)
          assert.equal(first.status, 200)
          const result = await first.json()
          assert.equal(result.data.amount, 12000)
          assert.equal(result.data.category, 'deposit')
          assert.equal(result.data.type, 'income')
          assert.equal(result.data.paymentMethod, 'cash')
          assert.equal(result.event.status, 'active')
          assert.equal(result.event.syncVersion, 2)
          assert.equal((await post(event)).status, 200)
          assert.equal(
            await Transactions.countDocuments({ tenantId, eventId: event._id }),
            1
          )
          assert.equal((await Events.findById(event._id)).syncVersion, 2)
          assert.equal(
            (await post(event, { amount: 1, paymentMethod: 'cash' })).status,
            409
          )
        }
      )
      await t.test('parallel requests never duplicate payment', async () => {
        const event = await createEvent()
        const responses = await Promise.all([post(event), post(event)])
        assert.ok(
          responses.every((response) => [200, 409].includes(response.status))
        )
        assert.equal((await post(event)).status, 200)
        assert.equal(
          await Transactions.countDocuments({ tenantId, eventId: event._id }),
          1
        )
      })
      await t.test(
        'unauthenticated, foreign event and foreign client are rejected',
        async () => {
          const event = await createEvent()
          context = {}
          assert.equal((await post(event)).status, 401)
          context = { tenantId: otherTenant }
          assert.equal((await post(event)).status, 404)
          context = { tenantId }
          const foreignClient = await Clients.create({ tenantId: otherTenant })
          const bad = await createEvent({ clientId: foreignClient._id })
          assert.equal((await post(bad)).status, 404)
          assert.equal(
            await Transactions.countDocuments({
              eventId: { $in: [event._id, bad._id] },
            }),
            0
          )
        }
      )
      await t.test(
        'rejects invalid amount, obligation, missing date and inactive states',
        async () => {
          const event = await createEvent()
          for (const amount of [0, -1, 'NaN'])
            assert.equal(
              (await post(event, { amount, paymentMethod: 'cash' })).status,
              400
            )
          assert.equal(
            (await post(event, { amount: 1, paymentMethod: 'obligation' }))
              .status,
            400
          )
          for (const status of ['closed', 'canceled'])
            assert.equal(
              (await post(await createEvent({ status }))).status,
              409
            )
          assert.equal(
            (await post(await createEvent({ eventDate: null }))).status,
            400
          )
        }
      )
      await t.test(
        'does not count obligation as received and ignores client-owned service fields',
        async () => {
          const event = await createEvent({ status: 'active' })
          await Transactions.create({
            tenantId,
            eventId: event._id,
            amount: 15000,
            type: 'income',
            category: 'deposit',
            paymentMethod: 'obligation',
          })
          const response = await post(event, {
            amount: 10,
            paymentMethod: 'transfer',
            tenantId: otherTenant,
            category: 'other',
            type: 'expense',
            clientId: new mongoose.Types.ObjectId(),
          })
          const body = await response.json()
          assert.equal(response.status, 200)
          assert.equal(body.data.tenantId, tenantId)
          assert.equal(body.data.clientId, String(client._id))
          assert.equal(body.data.category, 'deposit')
          assert.equal(body.data.type, 'income')
        }
      )
      await t.test(
        'retry completes confirmation after failed event update',
        async () => {
          const event = await createEvent()
          const original = Events.findOneAndUpdate
          Events.findOneAndUpdate = () => {
            throw Error('simulated failure')
          }
          try {
            await assert.rejects(post(event), /simulated failure/)
          } finally {
            Events.findOneAndUpdate = original
          }
          assert.equal(
            await Transactions.countDocuments({ tenantId, eventId: event._id }),
            1
          )
          assert.equal((await Events.findById(event._id)).status, 'draft')
          assert.equal((await post(event)).status, 200)
          assert.equal((await Events.findById(event._id)).status, 'active')
          assert.equal(
            await Transactions.countDocuments({ tenantId, eventId: event._id }),
            1
          )
        }
      )
    } finally {
      await mongoose.disconnect()
      child.kill()
      await exited
    }
  }
)
