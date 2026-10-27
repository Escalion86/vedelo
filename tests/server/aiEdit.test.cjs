const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const mongoose = require('mongoose')
const { loadBindings, transformSync } = require('next/dist/build/swc')

function load(file, mocks) {
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' }, module: { type: 'commonjs' },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)((name) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`)
    return mocks[name]
  }, loaded, loaded.exports)
  return loaded.exports
}

test('AI editing: real standalone Mongo, tenant isolation, retries and conflict preflight', {
  skip: !process.env.AI_EDIT_TEST_MONGOD, timeout: 90000,
}, async () => {
  await loadBindings()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedelo-ai-edit-'))
  const probe = net.createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = probe.address().port
  await new Promise((resolve) => probe.close(resolve))
  const child = spawn(process.env.AI_EDIT_TEST_MONGOD, ['--dbpath', dir, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet'], { stdio: 'ignore', windowsHide: true })
  const exited = once(child, 'exit')
  try {
    await mongoose.connect(`mongodb://127.0.0.1:${port}/ai_edit_test`, { serverSelectionTimeoutMS: 30000 })
    const contract = await import('../../helpers/aiEditContract.mjs')
    const base = {
      tenantId: mongoose.Schema.Types.ObjectId, syncVersion: { type: Number, default: 1 },
      aiEditReceipts: { type: [String], select: false, default: undefined },
    }
    const Events = mongoose.model('AiTestEvents', new mongoose.Schema({
      ...base, status: String, eventType: String, clientId: mongoose.Schema.Types.ObjectId,
      eventDate: Date, contractSum: Number, additionalEvents: [mongoose.Schema.Types.Mixed],
    }, { timestamps: true }))
    const Clients = mongoose.model('AiTestClients', new mongoose.Schema({ ...base, firstName: String, phone: Number }, { timestamps: true }))
    const transactionSchema = new mongoose.Schema({
      ...base, eventId: mongoose.Schema.Types.ObjectId, clientId: mongoose.Schema.Types.ObjectId,
      amount: Number, date: Date, type: String, category: String, paymentMethod: String, comment: String,
      aiEditPaymentFingerprint: String,
    }, { timestamps: true })
    transactionSchema.index({ tenantId: 1, aiEditPaymentFingerprint: 1 }, {
      unique: true, partialFilterExpression: { aiEditPaymentFingerprint: { $type: 'string' } },
    })
    const Transactions = mongoose.model('AiTestTransactions', transactionSchema)
    await Transactions.init()
    const Plans = load('models/AiEditPlans.js', { mongoose }).default
    let proposal
    let providerCalls = 0
    let lastProviderRequest
    const service = load('server/aiEdit.js', {
      mongoose, 'node:crypto': require('node:crypto'), '@models/Events': Events, '@models/Clients': Clients, '@models/Transactions': Transactions,
      '@models/AiEditPlans': Plans,
      '@models/Services': { find: () => ({ select: () => ({ limit: () => ({ lean: async () => [] }) }) }) },
      '@models/SiteSettings': { findOne: () => ({ select: () => ({ lean: async () => ({ timeZone: 'Asia/Krasnoyarsk' }) }) }) },
      '@server/aiSettings': { getTenantAiSettings: async () => ({}) },
      '@server/aiChatCompletion': { requestAiChatCompletion: async (args) => { lastProviderRequest = args; providerCalls++; return { content: JSON.stringify(proposal) } } },
      '@server/activityHistory': { recordActivityHistory: async () => {} },
      '@server/CRUD': { updateEventInCalendar: async () => {} },
      '@server/taskPushNotifications': { notifyTaskCreated: async () => {}, notifyTaskUpdated: async () => {}, notifyTaskCompleted: async () => {} },
      '@helpers/aiEditContract.mjs': contract,
      '@helpers/aiEventDraftContacts.mjs': await import('../../helpers/aiEventDraftContacts.mjs'),
      '@helpers/clientMessengerAvailability': load('helpers/clientMessengerAvailability.js', {}),
    })
    const tenantId = new mongoose.Types.ObjectId(), other = new mongoose.Types.ObjectId()
    const client = await Clients.create({ tenantId, firstName: 'Анна' })
    const event = await Events.create({ tenantId, clientId: client._id, status: 'active', eventDate: new Date('2026-10-25T10:00Z'), contractSum: 100 })
    const context = { tenantId, user: { _id: tenantId } }
    const prepare = () => service.prepareAiEdit({ tenantId, userId: tenantId, eventId: String(event._id), text: 'Изменить' })
    const apply = (planId, ctx = context) => service.applyAiEdit({ planId, context: ctx, req: {}, access: {} })
    const payment = { entity: 'transaction', operation: 'create', patch: {
      amount: 10000, type: 'income', category: 'deposit', paymentMethod: 'cash', date: '2026-10-20T10:00:00Z',
    } }
    proposal = { actions: [payment, { entity: 'event', operation: 'update', id: String(event._id), patch: { contractSum: 30000 } }] }
    const plan = await prepare()
    assert.deepEqual(plan.eventPatch, { contractSum: 30000 })
    assert.equal(plan.clientPatch, null)
    assert.equal(await Transactions.countDocuments({ tenantId }), 0, 'preparation never changes business records')
    await assert.rejects(() => apply(plan.planId, { tenantId: other, user: { _id: other } }), /не найден/)
    await assert.rejects(() => apply(plan.planId, { tenantId, user: { _id: other } }), /не найден/)
    const outcomes = await Promise.all([apply(plan.planId), apply(plan.planId)])
    assert.ok(outcomes.some((result) => result.done))
    assert.equal(await Transactions.countDocuments({ tenantId }), 1)
    assert.equal((await Events.findById(event._id)).contractSum, 30000)
    const saved = await Events.findById(event._id).lean()
    assert.equal((await apply(plan.planId)).done, true)
    assert.deepEqual(await Events.findById(event._id).lean(), saved)
    assert.equal(providerCalls, 1, 'apply never calls or charges AI')
    // Simulate a lost progress write after the actual mutations.
    await Plans.updateOne({ _id: plan.planId, tenantId }, { $set: { completed: [] } })
    assert.equal((await apply(plan.planId)).done, true)
    assert.equal(await Transactions.countDocuments({ tenantId }), 1)
    proposal = { actions: [
      { entity: 'client', operation: 'update', id: String(client._id), patch: { firstName: 'Мария' } },
      { entity: 'event', operation: 'update', id: String(event._id), patch: { contractSum: 50000 } },
    ] }
    const stale = await prepare()
    assert.deepEqual(stale.clientPatch, { _id: String(client._id), firstName: 'Мария' })
    await Events.updateOne({ _id: event._id, tenantId }, { $set: { contractSum: 40000 }, $inc: { syncVersion: 1 } })
    assert.equal((await apply(stale.planId)).conflict, true)
    assert.equal((await Clients.findById(client._id)).firstName, 'Анна', 'preflight prevents partial writes for known conflicts')
    await assert.rejects(() => service.prepareAiEdit({ tenantId: other, userId: other, eventId: String(event._id), text: 'x' }), /не найдена/)
    proposal = { question: 'Каким способом оплата?', actions: [payment] }
    assert.equal((await prepare()).steps.length, 0)
    assert.equal(await Transactions.countDocuments({ tenantId }), 1)
    proposal = { actions: [{ ...payment, patch: { ...payment.patch, amount: 11000 } }] }
    const concurrentPlans = await Promise.all([prepare(), prepare()])
    const paymentResults = await Promise.all(concurrentPlans.map((p) => apply(p.planId)))
    assert.equal(paymentResults.filter((r) => r.done).length, 1)
    assert.equal(paymentResults.filter((r) => r.conflict).length, 1)
    assert.equal(await Transactions.countDocuments({ tenantId, amount: 11000 }), 1)
    const foreignClient = await Clients.create({ tenantId: other, firstName: 'Чужой', phone: 79992222222 })
    const foreignEvent = await Events.create({ tenantId: other, clientId: foreignClient._id, status: 'active' })
    await Clients.updateOne({ _id: client._id, tenantId }, { $set: { phone: 79992222222 } })
    proposal = { ids: [String(event._id), String(foreignEvent._id)] }
    const found = await service.searchAiEditEvents({ tenantId, userId: tenantId, text: 'Найди заказ по телефону из буфера', clientPhone: '79992222222' })
    assert.deepEqual(found.candidates.map(c => c.id), [String(event._id)])
    const sentCandidates = JSON.parse(lastProviderRequest.messages[1].content).candidates
    assert.equal(sentCandidates.length, 1)
    assert.equal(sentCandidates[0].matchesClipboardPhone, true)
    assert.equal(sentCandidates[0].phone, undefined)
    const route = load('app/api/events/ai-edit/route.js', {
      'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
      '@server/getRequestContext': async () => ({ tenantId: null }),
      '@server/getUserTariffAccess': async () => { throw new Error('must not be called') },
      '@server/dbConnect': async () => {}, '@server/aiEdit': service,
      '@server/aiBilling': { isAiBalanceError: () => false },
      '@server/aiEventIntent': {}, '@server/eventAiDraft': {},
      '@helpers/aiAssistantClipboard.mjs': await import('../../helpers/aiAssistantClipboard.mjs'),
    })
    assert.equal((await route.POST(new Request('http://test', { method: 'POST', body: '{}' }))).status, 401)
  } finally {
    await mongoose.disconnect()
    child.kill()
    await exited
    const target = path.resolve(dir)
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('vedelo-ai-edit-'))
    fs.rmSync(target, { recursive: true, force: true })
  }
})
