const test = require('node:test')
const assert = require('node:assert/strict')
const { isDeepStrictEqual } = require('node:util')
const { loadBindings } = require('next/dist/build/swc')
const { loader, json, chain } = require('./stageFLoader.cjs')

const tenantId = 'a'.repeat(24)
const proposalId = 'b'.repeat(24)
const eventId = 'c'.repeat(24)
const foreign = 'd'.repeat(24)
const copy = (value) => structuredClone(value)
const equal = (a, b) => a instanceof Date || b instanceof Date
  ? new Date(a).getTime() === new Date(b).getTime()
  : a === b || (a == null && b == null)

// Только граница хранения: независимые прочитанные документы, Mongo-фильтры и
// запись изменённых полей. Решения о блокировке выполняют настоящие routes.
function matches(record, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((part) => matches(record, part))
    const actual = key.split('.').reduce((part, field) => part?.[field], record)
    if (Array.isArray(value) || (value && typeof value === 'object' && !(value instanceof Date) && !Object.keys(value).some((key) => key.startsWith('$'))))
      return isDeepStrictEqual(actual, value)
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).every(([operator, operand]) => {
        if (operator === '$in') return operand.some((item) => equal(actual, item))
        if (operator === '$nin') return !operand.some((item) => equal(actual, item))
        if (operator === '$gt') return actual > operand
        if (operator === '$gte') return actual >= operand
        if (operator === '$ne') return !equal(actual, operand)
        throw new Error(`Неизвестный Mongo-оператор ${operator}`)
      })
    }
    return equal(actual, value)
  })
}

function fixture() {
  const records = {
    Proposals: {
      _id: proposalId, tenantId, eventId, publicId: 'public-fixture',
      status: 'published', title: 'КП', version: 1,
      validUntil: new Date('2030-10-20'),
      selectedPackageId: 'basic', selectedAt: new Date('2026-10-01'),
      selectionHistory: [], selectionTaskCreatedAt: null,
      appliedAt: null, appliedPackageId: '', appliedSelectionAt: null,
      blocksSnapshot: [], mediaSnapshot: [],
      packages: [
        { id: 'basic', title: 'Основной', total: 3500, lines: [{ title: 'Работа', price: 3500 }] },
        { id: 'extended', title: 'Полный', total: 4000, lines: [{ title: 'Работа', price: 4000 }] },
      ],
    },
    Events: { _id: eventId, tenantId, status: 'draft', contractSum: 0, servicesIds: [], additionalEvents: [], syncVersion: 1 },
  }
  let currentTenant = tenantId
  const hooks = {}, writes = [], pushes = []
  const document = (name, value) => {
    let initial = copy(value)
    const doc = copy(value)
    Object.defineProperties(doc, {
      toJSON: { value: () => copy(Object.fromEntries(Object.entries(doc).filter(([key]) => key !== '$where'))) },
      save: { value: async () => {
        await hooks[`save${name}`]?.(doc)
        const filter = { _id: doc._id, ...(doc.$where || {}) }
        if (!matches(records[name], filter)) {
          const error = new Error('Документ изменился')
          error.name = 'DocumentNotFoundError'
          throw error
        }
        const changes = Object.fromEntries(Object.entries(doc).filter(([key, value]) => key !== '$where' && !isDeepStrictEqual(initial[key], value)))
        Object.assign(records[name], copy(changes))
        writes.push([name, copy(changes)])
        initial = doc.toJSON()
        return doc
      } },
    })
    return doc
  }
  const model = (name) => ({
    findOne(filter) {
      const value = records[name]
      return chain(value && matches(value, filter) ? document(name, value) : null)
    },
    find: (filter) => chain((Array.isArray(records[name]) ? records[name] : []).filter((value) => matches(value, filter))),
    async findOneAndUpdate(filter, update) {
      await hooks[`update${name}`]?.(filter, update)
      const value = records[name]
      if (!value || !matches(value, filter)) return null
      Object.assign(value, copy(update.$set || {}))
      for (const key of Object.keys(update.$unset || {})) delete value[key]
      for (const [key, amount] of Object.entries(update.$inc || {})) value[key] = (value[key] || 0) + amount
      writes.push([name, copy(update)])
      await hooks[`afterUpdate${name}`]?.(filter, update)
      return document(name, value)
    },
    async updateOne(filter, update) {
      const result = await this.findOneAndUpdate(filter, update)
      return { matchedCount: result ? 1 : 0 }
    },
  })
  const load = loader({
    'next/server': { NextResponse: json },
    '@models/Users': { findOne: () => chain(null) },
    '@models/Proposals': model('Proposals'),
    '@models/Events': model('Events'),
    '@models/Services': model('Services'),
    '@server/dbConnect': async () => {},
    '@server/getRequestContext': async () => ({ tenantId: currentTenant, user: currentTenant ? { _id: currentTenant } : null }),
    '@server/getUserTariffAccess': async () => ({ allowProposals: true }),
    '@server/pushNotifications': { sendPushToTenant: async (payload) => pushes.push(payload) },
  })
  const credentials = load('server/proposals.js').createProposalPublicCredentials(proposalId)
  Object.assign(records.Proposals, { publicId: credentials.publicId, publicTokenNonce: credentials.nonce, publicTokenHash: credentials.tokenHash })
  const token = load('server/proposals.js').buildProposalPublicUrl(records.Proposals, 'https://example.test').split('/').at(-1)
  const publicRoute = load('app/api/public/proposals/[publicId]/[token]/route.js')
  const route = load('app/api/proposals/[id]/route.js')
  const req = (body) => ({ json: async () => body, nextUrl: { origin: 'https://example.test' }, headers: { get: () => null } })
  const params = { publicId: credentials.publicId, token }
  return {
    records, hooks, writes, pushes, req, publicRoute, params,
    preview: (body = {}) => load('app/api/proposals/[id]/preview/route.js').POST(req(body), { params: { id: proposalId } }),
    select: (packageId) => publicRoute.POST(req({ packageId }), { params }),
    edit: (body) => route.PATCH(req(body), { params: { id: proposalId } }),
    apply: () => route.PATCH(req({ action: 'apply' }), { params: { id: proposalId } }),
    read: () => route.GET(req(), { params: { id: proposalId } }),
    setTenant: (value) => { currentTenant = value },
  }
}

test.before(() => loadBindings())

test('после настоящего apply public POST отвергает другой и повторный вариант без каких-либо мутаций', async () => {
  const f = fixture()
  assert.equal((await f.apply()).status, 200)
  const before = copy(f.records)
  const writes = f.writes.length
  for (const id of ['extended', 'basic']) {
    const result = await f.select(id)
    assert.equal(result.status, 409, 'после применения выбор должен быть закрыт')
    assert.equal(result.body.error.code, 'selection_locked')
    assert.deepEqual(f.records, before)
    assert.equal(f.writes.length, writes)
    assert.equal(f.pushes.length, 0)
  }
})

test('до apply смена и повтор работают; public GET сообщает блокировку после apply', async () => {
  const f = fixture()
  assert.equal((await f.select('extended')).status, 200)
  assert.equal(f.records.Proposals.selectedPackageId, 'extended')
  assert.equal(f.records.Proposals.selectionHistory.length, 1)
  assert.equal(f.records.Events.additionalEvents.length, 1)
  assert.equal(f.pushes.length, 1)
  const selectedAt = f.records.Proposals.selectedAt
  assert.equal((await f.select('extended')).status, 200)
  assert.deepEqual(f.records.Proposals.selectedAt, selectedAt)
  assert.equal(f.records.Proposals.selectionHistory.length, 1)
  assert.equal((await f.select('basic')).status, 200)
  assert.equal(f.pushes.length, 2)
  assert.equal(f.records.Events.additionalEvents.length, 1)
  const get = () => f.publicRoute.GET(f.req({}), { params: f.params })
  assert.equal((await get()).body.data.selectionLocked, false)
  assert.equal((await f.apply()).status, 200)
  const result = await get()
  assert.equal(result.body.data.selectionLocked, true)
  assert.equal(result.body.data.appliedPackageId, 'basic')
  assert.equal(result.headers['Cache-Control'], 'no-store')
})

test('историческое расхождение не переписывается и не разрешает повторное apply', async () => {
  for (const marker of [{ appliedAt: new Date('2026-10-02') }, { appliedPackageId: 'basic' }]) {
    const f = fixture()
    Object.assign(f.records.Proposals, marker, { selectedPackageId: 'extended' })
    const before = copy(f.records)
    assert.equal((await f.select('basic')).status, 409)
    assert.equal((await f.apply()).status, 409)
    assert.deepEqual(f.records, before)
    assert.equal(f.writes.length, 0)
  }
})

function gate() {
  let entered, release
  const waiting = new Promise((resolve) => { entered = resolve })
  const held = new Promise((resolve) => { release = resolve })
  return { waiting, release, pause: async () => { entered(); await held } }
}

test('публичное чтение до apply, поздний save после apply: атомарный отказ без побочных действий', async () => {
  const f = fixture(), g = gate()
  f.hooks.saveProposals = async () => { delete f.hooks.saveProposals; await g.pause() }
  const selection = f.select('extended')
  await g.waiting
  assert.equal((await f.apply()).status, 200)
  const approved = copy(f.records)
  g.release()
  const result = await selection
  assert.equal(result.status, 409)
  assert.deepEqual(f.records, approved)
  assert.equal(f.pushes.length, 0)
})

test('apply со старого чтения проигрывает уже сохранённому новому выбору', async () => {
  const f = fixture(), g = gate()
  // Пауза до первого финального Mongo-write apply; в прежнем коде это Events,
  // в исправленном — атомарная резервация Proposals.
  const pause = async () => {
    delete f.hooks.updateProposals
    delete f.hooks.updateEvents
    await g.pause()
  }
  f.hooks.updateProposals = pause
  f.hooks.updateEvents = pause
  const applying = f.apply()
  await g.waiting
  assert.equal((await f.select('extended')).status, 200)
  const before = copy(f.records)
  g.release()
  assert.equal((await applying).status, 409)
  assert.deepEqual(f.records, before)
})

test('резервация apply блокирует выбор; второй apply завершает ту же операцию', async () => {
  const f = fixture(), g = gate()
  f.hooks.updateEvents = async () => { delete f.hooks.updateEvents; await g.pause() }
  const applying = f.apply()
  await g.waiting
  const during = copy(f.records)
  const selection = await f.select('extended')
  const repeated = await f.apply()
  g.release()
  assert.equal(selection.status, 409)
  assert.equal(repeated.status, 200)
  assert.equal((await applying).status, 200)
  assert.equal(f.records.Proposals.selectedPackageId, 'basic')
  assert.deepEqual(f.records.Proposals.selectedAt, during.Proposals.selectedAt)
  assert.equal(f.records.Events.agreedProposal.packageId, 'basic')
  assert.equal(f.records.Events.contractSum, 3500)
  assert.equal(f.records.Events.syncVersion, 2)
})

test('closed/canceled и удалённый/чужой заказ не применяются и не оставляют блокировку', async () => {
  for (const state of ['closed', 'canceled', 'foreign', 'missing']) {
    const f = fixture()
    if (state === 'missing') delete f.records.Events
    else if (state === 'foreign') f.records.Events.tenantId = foreign
    else f.records.Events.status = state
    const before = copy(f.records)
    const result = await f.apply()
    assert.equal(result.status, 409)
    assert.equal(result.body.error.code, 'event_not_available')
    assert.deepEqual(f.records, before)
  }
})



test('настоящий Mongoose save передаёт atomic guards драйверу и обрабатывает no-match', async () => {
  const mongoose = require('mongoose')
  const f = fixture()
  const source = loader()
  const schema = new mongoose.Schema(source('schemas/proposalsSchema.js').default, { timestamps: true, bufferCommands: false })
  const Model = mongoose.model('ProposalSelectionLockTest', schema)
  const doc = Model.hydrate(f.records.Proposals)
  let writtenFilter, writtenUpdate
  Model.collection.updateOne = async (filter, update) => {
    writtenFilter = filter
    writtenUpdate = update
    return { matchedCount: 0 }
  }
  const realRoute = loader({
    'next/server': { NextResponse: json },
    '@models/Users': { findOne: () => chain(null) },
    '@models/Proposals': { findOne: async () => doc },
    '@models/Events': { findOne: () => { throw new Error('Побочные действия при отказе запрещены') } },
    '@server/dbConnect': async () => {},
    '@server/pushNotifications': { sendPushToTenant: () => { throw new Error('Push при отказе запрещён') } },
  })('app/api/public/proposals/[publicId]/[token]/route.js')
  try {
    const result = await realRoute.POST(f.req({ packageId: 'extended' }), { params: f.params })
    assert.equal(result.status, 409)
    assert.equal(result.body.error.code, 'selection_conflict')
    assert.equal(writtenFilter.applyOperation, null)
    assert.equal(writtenUpdate.$set?.applyOperation, undefined, 'гидратация старого документа не записывает default поверх резервации')
    assert.equal(writtenFilter.appliedAt, null)
    assert.deepEqual(writtenFilter.appliedPackageId, { $in: ['', null] })
    assert.equal(writtenFilter.appliedSelectionAt, null)
    assert.equal(String(writtenFilter.tenantId), tenantId)
    assert.equal(writtenFilter.status, 'published')
    assert.equal(writtenFilter.publicTokenHash, f.records.Proposals.publicTokenHash)
    assert.deepEqual(writtenFilter.selectedAt, f.records.Proposals.selectedAt)
  } finally {
    mongoose.deleteModel('ProposalSelectionLockTest')
  }
})

test('настоящие Mongoose query/schema сохраняют pending, CAS, opID и точный readback через ошибки драйвера', async () => {
  const mongoose = require('mongoose')
  const source = loader(), f = fixture()
  const Proposal = mongoose.model('ApplyOperationProposalTest', new mongoose.Schema(source('schemas/proposalsSchema.js').default, { timestamps: true, bufferCommands: false }))
  const Event = mongoose.model('ApplyOperationEventTest', new mongoose.Schema(source('schemas/eventsSchema.js').default, { timestamps: true, bufferCommands: false }))
  const bsonCopy = (v) => mongoose.mongo.BSON.deserialize(mongoose.mongo.BSON.serialize(v))
  const plain = (v) => JSON.parse(JSON.stringify(v))
  const records = {
    Proposal: new Proposal(f.records.Proposals).toObject(),
    Event: new Event({ ...f.records.Events, servicesIds: [foreign], agreedProposal: { legacyField: 'keep' }, updatedAt: new Date('2026-09-01') }).toObject(),
  }
  const writes = [], reads = []
  let failure = 'before'
  for (const [name, Model] of [['Proposal', Proposal], ['Event', Event]]) {
    Model.collection.findOne = async (filter) => {
      reads.push(name)
      return matches(plain(records[name]), plain(filter)) ? bsonCopy(records[name]) : null
    }
    Model.collection.findOneAndUpdate = async (filter, update, options) => {
      writes.push({ name, filter, update, options })
      if (name === 'Event' && failure === 'before') throw new Error('driver before write')
      if (!matches(plain(records[name]), plain(filter))) return null
      Object.assign(records[name], bsonCopy(update.$set || {}))
      for (const [key, amount] of Object.entries(update.$inc || {})) records[name][key] = (records[name][key] || 0) + amount
      if (name === 'Event' && failure === 'after') throw new Error('driver response lost')
      return bsonCopy(records[name])
    }
  }
  const route = loader({
    'next/server': { NextResponse: json },
    '@models/Users': { findOne: () => chain(null) },
    '@models/Proposals': Proposal,
    '@models/Events': Event,
    '@models/Services': { find: () => chain([]) },
    '@server/dbConnect': async () => {},
    '@server/getRequestContext': async () => ({ tenantId, user: { _id: tenantId } }),
    '@server/getUserTariffAccess': async () => ({ allowProposals: true }),
  })('app/api/proposals/[id]/route.js')
  const apply = () => route.PATCH(f.req({ action: 'apply' }), { params: { id: proposalId } })
  try {
    await assert.rejects(apply(), /driver before write/)
    assert.equal(records.Proposal.appliedAt, null)
    const op = records.Proposal.applyOperation
    assert.ok(op.id)
    assert.ok(op.startedAt instanceof Date)
    assert.ok(op.selectedAt instanceof Date)
    assert.equal(Proposal.schema.path('applyOperation').schema.options._id, false)
    assert.equal(Proposal.schema.path('applyOperation').schema.path('agreement.total').instance, 'Number')
    failure = 'after'
    await assert.rejects(apply(), /driver response lost/)
    assert.equal(records.Event.syncVersion, 2)
    assert.equal(records.Proposal.appliedAt, null)
    failure = null
    const count = reads.filter((name) => name === 'Event').length
    const result = await apply()
    assert.equal(result.status, 200)
    assert.ok(reads.filter((name) => name === 'Event').length >= count + 2, 'успех подтверждается повторными чтениями заказа')
    assert.equal(records.Event.syncVersion, 2)
    assert.equal(records.Event.agreedProposal.applyOperationId, op.id)
    assert.equal(records.Event.agreedProposal.legacyField, 'keep')
    assert.equal(records.Proposal.applyOperation.state, 'confirmed')
    const reserve = writes.find((w) => w.update.$set?.applyOperation)
    assert.equal(reserve.filter.applyOperation, null)
    assert.equal(reserve.filter.appliedAt, null)
    assert.deepEqual(reserve.filter.appliedPackageId, { $in: ['', null] })
    assert.equal(String(reserve.filter.tenantId), tenantId)
    assert.ok(reserve.filter.selectedAt instanceof Date)
    for (const w of writes.filter((w) => w.name === 'Event')) {
      assert.equal(String(w.filter.tenantId), tenantId)
      assert.equal(w.filter.syncVersion, 1)
      assert.equal(w.filter.status, 'draft')
      assert.equal(w.filter.contractSum, 0)
      assert.deepEqual(w.filter.servicesIds.map(String), [foreign])
      assert.ok(w.filter.servicesIds[0] instanceof mongoose.Types.ObjectId)
      assert.deepEqual(w.filter.agreedProposal, { legacyField: 'keep' })
      assert.deepEqual(w.filter.updatedAt, new Date('2026-09-01'))
      assert.equal(w.update.$set.agreedProposal.applyOperationId, op.id)
      assert.ok(w.update.$set.updatedAt >= op.startedAt)
      assert.deepEqual(w.update.$set.updatedAt, w.update.$set.agreedProposal.applyOperationWrittenAt)
      assert.deepEqual(w.update.$inc, { syncVersion: 1 })
    }
    const final = writes.at(-1)
    assert.equal(final.filter['applyOperation.id'], op.id)
    assert.equal(String(final.filter.tenantId), tenantId)
    assert.deepEqual(final.update.$set.appliedAt, records.Event.updatedAt)
  } finally {
    mongoose.deleteModel('ApplyOperationProposalTest')
    mongoose.deleteModel('ApplyOperationEventTest')
  }
})

test('блок HTTP smoke проверяет confirmed retry по настоящему route без повторных записей', async () => {
  const { readFileSync } = require('node:fs')
  const path = require('node:path')
  const smoke = readFileSync(path.join(__dirname, 'webDocumentWorkflowSmoke.mjs'), 'utf8')
  const start = smoke.indexOf('  assert.equal((await patch(proposalPath, { action: \'apply\' })).status,', smoke.indexOf('  const approvedSelection ='))
  const end = smoke.indexOf('  const approvedPublic =', start)
  assert.ok(start > 0 && end > start, 'выполняется настоящий блок smoke, не его копия')
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const check = new AsyncFunction('assert', 'patch', 'proposalPath', 'db', 'draftEventId', 'agreed', 'request', 'approvedSelection', smoke.slice(start, end))
  const f = fixture()
  assert.equal((await f.apply()).status, 200)
  const agreed = copy(f.records.Events)
  const approvedSelection = JSON.parse(JSON.stringify((await f.read()).body.data))
  const writes = f.writes.length
  const db = { collection: () => ({ findOne: async () => copy(f.records.Events) }) }
  await check(assert, () => f.apply(), `/api/proposals/${proposalId}`, db, eventId, agreed,
    async () => ({ json: async () => JSON.parse(JSON.stringify((await f.read()).body)) }), approvedSelection)
  assert.equal(f.writes.length, writes)
  assert.deepEqual(f.records.Events, agreed)
})

for (const mixedField of ['eventGuard', 'lines']) {
  for (const retry of [false, true]) {
    test(`Mongoose/BSON сохраняет пустые Mixed-объекты ${mixedField}: ${retry ? 'pending retry' : 'первый apply'}`, async () => {
      const mongoose = require('mongoose')
      const source = loader(), f = fixture()
      const suffix = `${mixedField}_${retry}`
      const Proposal = mongoose.model(`EmptyMixedProposal_${suffix}`, new mongoose.Schema(source('schemas/proposalsSchema.js').default, { timestamps: true, bufferCommands: false }))
      const Event = mongoose.model(`EmptyMixedEvent_${suffix}`, new mongoose.Schema(source('schemas/eventsSchema.js').default, { timestamps: true, bufferCommands: false }))
      const bson = mongoose.mongo.BSON
      const bsonCopy = (value) => bson.deserialize(bson.serialize(value))
      const plain = (value) => JSON.parse(JSON.stringify(value))
      const oldAgreement = mixedField === 'eventGuard'
        ? { legacy: { keep: true, nested: {} }, empty: {} }
        : null
      if (mixedField === 'lines') {
        Object.assign(f.records.Proposals.packages[0].lines[0], {
          legacy: { keep: true, nested: {} }, empty: {},
        })
      }
      const lines = bsonCopy({ lines: f.records.Proposals.packages[0].lines }).lines
      const records = {
        Proposal: new Proposal(f.records.Proposals).toObject({ minimize: false }),
        Event: new Event({ ...f.records.Events, updatedAt: new Date('2026-09-01') }).toObject({ minimize: false }),
      }
      // Existing BSON data: do not let fixture construction minimize the regression away.
      records.Event.agreedProposal = bsonCopy({ value: oldAgreement }).value
      const writes = []
      let loseReservationResponse = retry
      for (const [name, Model] of [['Proposal', Proposal], ['Event', Event]]) {
        Model.collection.findOne = async (filter) => matches(plain(records[name]), plain(filter)) ? bsonCopy(records[name]) : null
        Model.collection.findOneAndUpdate = async (filter, update) => {
          if (!matches(plain(records[name]), plain(filter))) return null
          const stored = bsonCopy(update.$set || {})
          writes.push({ name, filter: bsonCopy(filter), stored })
          Object.assign(records[name], stored)
          for (const [key, amount] of Object.entries(update.$inc || {})) records[name][key] = (records[name][key] || 0) + amount
          if (name === 'Proposal' && stored.applyOperation?.state === 'pending' && loseReservationResponse) {
            loseReservationResponse = false
            throw new Error('reservation response lost')
          }
          return bsonCopy(records[name])
        }
      }
      const route = loader({
        'next/server': { NextResponse: json },
    '@models/Users': { findOne: () => chain(null) },
        '@models/Proposals': Proposal,
        '@models/Events': Event,
        '@models/Services': { find: () => chain([]) },
        '@server/dbConnect': async () => {},
        '@server/getRequestContext': async () => ({ tenantId, user: { _id: tenantId } }),
        '@server/getUserTariffAccess': async () => ({ allowProposals: true }),
      })('app/api/proposals/[id]/route.js')
      const apply = () => route.PATCH(f.req({ action: 'apply' }), { params: { id: proposalId } })
      const assertFrozen = (op) => {
        assert.deepEqual(op.eventGuard.agreedProposal, oldAgreement)
        assert.deepEqual(op.agreement.lines, lines)
        assert.deepEqual(bson.serialize({ value: op.eventGuard.agreedProposal }), bson.serialize({ value: oldAgreement }), 'BSON guard сохраняется побайтно')
        assert.deepEqual(bson.serialize({ lines: op.agreement.lines }), bson.serialize({ lines }), 'BSON Mixed-строк сохраняется побайтно')
      }
      try {
        if (retry) {
          await assert.rejects(apply(), /reservation response lost/)
          assert.equal(records.Proposal.appliedAt, null)
          assert.equal(records.Proposal.applyOperation.state, 'pending')
          assertFrozen(records.Proposal.applyOperation)
          assertFrozen(Proposal.hydrate(bsonCopy(records.Proposal)).applyOperation.toObject())
        }
        assert.equal((await apply()).status, 200, 'неизменённый заказ проходит apply')
        const operationWrites = writes.filter((write) => write.stored.applyOperation)
        assert.equal(operationWrites.length, 2, 'резервация и подтверждение')
        for (const write of operationWrites) assertFrozen(write.stored.applyOperation)
        const hydrated = Proposal.hydrate(bsonCopy(records.Proposal))
        assertFrozen(hydrated.applyOperation.toObject())
        assertFrozen(hydrated.applyOperation.toObject({ minimize: false }))
        assert.equal(hydrated.applyOperation.state, 'confirmed')
        assert.ok(hydrated.appliedAt instanceof Date)
        const eventWrites = writes.filter((write) => write.name === 'Event')
        assert.equal(eventWrites.length, 1)
        assert.deepEqual(eventWrites[0].filter.agreedProposal, oldAgreement, 'CAS сравнивает точный исходный BSON')
        assert.deepEqual(records.Event.agreedProposal.lines, lines)
        if (oldAgreement) {
          assert.deepEqual(records.Event.agreedProposal.empty, {})
          assert.deepEqual(records.Event.agreedProposal.legacy, oldAgreement.legacy)
        }
        assert.equal(records.Event.contractSum, 3500)
        assert.equal(records.Event.syncVersion, 2)
        const beforeRetry = bson.serialize(records.Proposal)
        const eventBeforeRetry = bson.serialize(records.Event)
        const writeCount = writes.length
        assert.equal((await apply()).status, 200)
        assert.equal(writes.length, writeCount, 'confirmed retry не пишет ни КП, ни заказ')
        assert.deepEqual(bson.serialize(records.Proposal), beforeRetry)
        assert.deepEqual(bson.serialize(records.Event), eventBeforeRetry)
      } finally {
        mongoose.deleteModel(Proposal.modelName)
        mongoose.deleteModel(Event.modelName)
      }
    })
  }
}

test('поздние revoke/token/tenant/expiry изменения отвергаются в финальном public save', async () => {
  for (const mutate of [
    (p) => { p.status = 'revoked' },
    (p) => { p.publicTokenHash = 'rotated' },
    (p) => { p.tenantId = foreign },
    (p) => { p.validUntil = new Date('2020-01-01') },
  ]) {
    const f = fixture()
    let before
    f.hooks.saveProposals = async () => {
      mutate(f.records.Proposals)
      before = copy(f.records)
    }
    assert.equal((await f.select('extended')).status, 409)
    assert.deepEqual(f.records, before)
    assert.equal(f.pushes.length, 0)
    assert.equal(f.writes.length, 0)
  }
})

test('ошибка ДО event-write: pending не утверждение; точный авторизованный повтор завершает один результат', async () => {
  const f = fixture()
  f.hooks.updateEvents = async () => { throw new Error('Синтетический сбой Mongo') }
  await assert.rejects(f.apply(), /Синтетический сбой Mongo/)
  assert.equal(f.records.Events.contractSum, 0)
  assert.equal(f.records.Proposals.appliedAt, null, 'резервация не является утверждением')
  assert.equal(f.records.Proposals.appliedPackageId, '')
  assert.ok(f.records.Proposals.applyOperation?.id)
  const pending = copy(f.records.Proposals.applyOperation)
  const publicResult = await f.publicRoute.GET(f.req({}), { params: f.params })
  assert.equal(publicResult.body.data.applicationPending, true)
  assert.equal(publicResult.body.data.selectionLocked, true)
  assert.equal(publicResult.body.data.appliedPackageId, '')
  assert.equal('applyOperation' in publicResult.body.data, false, 'внутренняя операция не публична')
  const preview = await f.preview({ applicationPending: false, selectionLocked: false, appliedPackageId: 'extended' })
  assert.equal(preview.status, 200)
  assert.equal(preview.body.data.applicationPending, true)
  assert.equal(preview.body.data.selectionLocked, true)
  assert.equal(preview.body.data.appliedPackageId, '')
  assert.equal('applyOperation' in preview.body.data, false)
  assert.equal((await f.select('extended')).status, 409)
  f.setTenant(foreign)
  assert.equal((await f.apply()).status, 404)
  f.setTenant(tenantId)
  delete f.hooks.updateEvents
  const result = await f.apply()
  assert.equal(result.status, 200)
  assert.equal(result.body.event.contractSum, 3500)
  assert.equal(f.records.Events.agreedProposal.applyOperationId, pending.id)
  assert.equal(f.records.Events.agreedProposal.packageId, 'basic')
  assert.equal(f.records.Events.syncVersion, 2)
  assert.ok(f.records.Proposals.appliedAt)
  assert.equal(f.records.Proposals.applyOperation.state, 'confirmed')
  const confirmedPreview = await f.preview()
  assert.equal(confirmedPreview.body.data.applicationPending, false)
  assert.equal(confirmedPreview.body.data.appliedPackageId, 'basic')
  const beforeRepeat = copy(f.records)
  assert.equal((await f.apply()).status, 200, 'новая подтверждённая операция сверяется идемпотентно')
  assert.deepEqual(f.records, beforeRepeat)
})

for (const boundary of ['after-event-write', 'proposal-finalization']) {
  test(`${boundary}: повтор сверяет точную сохранённую операцию, не дублируя sync`, async () => {
    const f = fixture()
    f.records.Events.agreedProposal = { legacyField: { keep: true } }
    if (boundary === 'after-event-write')
      f.hooks.afterUpdateEvents = async () => { throw new Error('Потерян ответ') }
    else f.hooks.updateProposals = async (_filter, update) => {
      if (update.$set?.appliedAt) throw new Error('Потерян ответ')
    }
    await assert.rejects(f.apply(), /Потерян ответ/)
    assert.equal(f.records.Events.contractSum, 3500)
    assert.equal(f.records.Events.syncVersion, 2)
    assert.equal(f.records.Proposals.appliedAt, null)
    assert.ok(f.records.Proposals.applyOperation?.id)
    const event = copy(f.records.Events)
    delete f.hooks.afterUpdateEvents
    delete f.hooks.updateProposals
    const responses = await Promise.all([f.apply(), f.apply()])
    assert.ok(responses.every((r) => r.status === 200))
    assert.deepEqual(f.records.Events, event)
    assert.deepEqual(f.records.Events.agreedProposal.legacyField, { keep: true })
    assert.equal(f.writes.filter(([name]) => name === 'Events').length, 1)
    assert.equal(f.records.Proposals.applyOperation.state, 'confirmed')
    assert.ok(f.records.Proposals.appliedAt)
  })
}

for (const stage of ['before-write', 'after-write']) {
  test(`pending ${stage}: изменения/закрытие/удаление/чужой tenant заказа не перезаписываются и не дают ложный успех`, async () => {
    for (const mutate of [
      (e) => { e.contractSum = 9000; e.syncVersion++ },
      (e) => { e.servicesIds = [foreign] },
      (e) => { e.agreedProposal = { unrelated: true } },
      (e) => { e.status = 'closed' },
      (e) => { e.status = 'canceled' },
      (e) => { e.updatedAt = new Date('2027-01-01') },
      (e) => { e.tenantId = foreign },
      (_e, records) => { delete records.Events },
    ]) {
      const f = fixture()
      f.hooks[stage === 'before-write' ? 'updateEvents' : 'afterUpdateEvents'] = async () => { throw new Error('Сбой') }
      await assert.rejects(f.apply(), /Сбой/)
      delete f.hooks.updateEvents
      delete f.hooks.afterUpdateEvents
      mutate(f.records.Events, f.records)
      const before = copy(f.records)
      assert.equal((await f.apply()).status, 409)
      assert.deepEqual(f.records, before)
      assert.equal((await f.select('extended')).status, 409)
      assert.equal(f.records.Proposals.appliedAt, null)
    }
  })
}

test('два конкурентных повтора после ошибки ДО write применяют ровно один раз', async () => {
  const f = fixture(), g = gate()
  f.hooks.updateEvents = async () => { throw new Error('Сбой') }
  await assert.rejects(f.apply(), /Сбой/)
  f.hooks.updateEvents = async () => { delete f.hooks.updateEvents; await g.pause() }
  const first = f.apply()
  await g.waiting
  assert.equal((await f.apply()).status, 200)
  const event = copy(f.records.Events)
  g.release()
  assert.equal((await first).status, 200)
  assert.deepEqual(f.records.Events, event)
  assert.equal(f.records.Events.syncVersion, 2)
  assert.equal(f.writes.filter(([name]) => name === 'Events').length, 1)
})

test('отложенный повтор использует время реальной записи заказа, не старое время резервации', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2027-01-01').getTime() })
  const f = fixture()
  f.hooks.updateEvents = async () => { throw new Error('Сбой') }
  await assert.rejects(f.apply(), /Сбой/)
  const started = f.records.Proposals.applyOperation.startedAt
  t.mock.timers.tick(86400000)
  delete f.hooks.updateEvents
  assert.equal((await f.apply()).status, 200)
  assert.ok(f.records.Events.updatedAt > started)
  assert.equal(f.records.Events.updatedAt.getTime(), Date.now())
  assert.deepEqual(f.records.Proposals.appliedAt, f.records.Events.updatedAt)
  assert.equal(f.records.Events.syncVersion, 2)
})

test('потеря ответа резервации сохраняет только pending и допускает точное завершение', async () => {
  const f = fixture()
  f.hooks.afterUpdateProposals = async (_filter, update) => {
    if (update.$set?.applyOperation?.state === 'pending') throw new Error('reservation response lost')
  }
  await assert.rejects(f.apply(), /reservation response lost/)
  assert.equal(f.records.Events.contractSum, 0)
  assert.equal(f.records.Events.syncVersion, 1)
  assert.equal(f.records.Proposals.appliedAt, null)
  const opId = f.records.Proposals.applyOperation.id
  delete f.hooks.afterUpdateProposals
  assert.equal((await f.apply()).status, 200)
  assert.equal(f.records.Events.agreedProposal.applyOperationId, opId)
  assert.equal(f.records.Events.syncVersion, 2)
})

test('потеря ответа после сохранённой proposal-finalization: повтор читает точный заказ без новых записей', async () => {
  const f = fixture()
  f.hooks.afterUpdateProposals = async (_filter, update) => {
    if (update.$set?.appliedAt) throw new Error('finalization response lost')
  }
  await assert.rejects(f.apply(), /finalization response lost/)
  delete f.hooks.afterUpdateProposals
  const before = copy(f.records), writes = f.writes.length
  const result = await f.apply()
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.event, before.Events)
  assert.deepEqual(f.records, before)
  assert.equal(f.writes.length, writes)
  f.records.Events.contractSum = 12345
  assert.equal((await f.apply()).status, 409, 'подтверждённый флаг без точного заказа не означает 200')
  assert.equal(f.records.Events.contractSum, 12345)
})

test('изменение заказа во время proposal-finalization оставляет состояние сверки, а не ложное утверждение', async () => {
  const f = fixture()
  f.hooks.updateProposals = async (_filter, update) => {
    if (update.$set?.appliedAt) {
      f.records.Events.contractSum = 9000
      f.records.Events.syncVersion++
    }
  }
  const result = await f.apply()
  assert.equal(result.status, 409)
  assert.equal(f.records.Events.contractSum, 9000)
  assert.equal(f.records.Events.syncVersion, 3)
  assert.equal(f.records.Proposals.appliedAt, null)
  assert.ok(f.records.Proposals.applyOperation?.id)
  const get = await f.publicRoute.GET(f.req({}), { params: f.params })
  assert.equal(get.body.data.applicationPending, true)
  assert.equal(get.body.data.appliedPackageId, '')
  assert.equal((await f.select('extended')).status, 409)
  const before = copy(f.records)
  assert.equal((await f.apply()).status, 409)
  assert.deepEqual(f.records, before)
})

test('чужой/неполный pending не сбрасывается и не применяется вслепую', async () => {
  const f = fixture()
  f.records.Proposals.applyOperation = { id: 'unknown', packageId: 'extended' }
  const before = copy(f.records)
  assert.equal((await f.apply()).status, 409)
  assert.equal((await f.select('extended')).status, 409)
  assert.deepEqual(f.records, before)
})

test('pending фиксирует только tenant-услуги и не пересчитывает их после удаления каталога', async () => {
  const f = fixture()
  const unavailable = 'e'.repeat(24)
  f.records.Services = [{ _id: foreign, tenantId }, { _id: unavailable, tenantId: foreign }]
  f.records.Proposals.packages[0].lines = [
    { serviceId: foreign, title: 'Своя услуга', price: 3500 },
    { serviceId: unavailable, title: 'Чужая услуга', price: 0 },
  ]
  f.hooks.updateEvents = async () => { throw new Error('Сбой') }
  await assert.rejects(f.apply(), /Сбой/)
  assert.deepEqual(f.records.Proposals.applyOperation.servicesIds, [foreign])
  f.records.Services = []
  delete f.hooks.updateEvents
  assert.equal((await f.apply()).status, 200)
  assert.deepEqual(f.records.Events.servicesIds, [foreign])
  assert.deepEqual(f.records.Events.agreedProposal.servicesIds, [foreign])
  assert.equal(f.records.Events.agreedProposal.lines.length, 2, 'недоступные строки снимка сохранены')
})

test('pending привязан к исходному заказу и не переносится на другой', async () => {
  const f = fixture()
  f.hooks.updateEvents = async () => { throw new Error('Сбой') }
  await assert.rejects(f.apply(), /Сбой/)
  delete f.hooks.updateEvents
  f.records.Proposals.eventId = foreign
  f.records.Events._id = foreign
  const before = copy(f.records)
  assert.equal((await f.apply()).status, 409)
  assert.deepEqual(f.records, before)
})

test('opID без точного снимка не подтверждает применение и не меняет новый заказ', async () => {
  for (const field of ['proposalId', 'packageId', 'selectedAt', 'total', 'lines', 'servicesIds']) {
    const f = fixture()
    f.hooks.afterUpdateEvents = async () => { throw new Error('Сбой') }
    await assert.rejects(f.apply(), /Сбой/)
    delete f.hooks.afterUpdateEvents
    f.records.Events.agreedProposal[field] = field === 'total' ? 9999 : 'changed'
    const before = copy(f.records)
    assert.equal((await f.apply()).status, 409)
    assert.deepEqual(f.records, before)
    assert.equal(f.records.Proposals.appliedAt, null)
  }
})

test('два apply со старых чтений: только один меняет заказ, проигравший не сбрасывает утверждение', async () => {
  const f = fixture(), g = gate()
  f.hooks.updateProposals = async () => { delete f.hooks.updateProposals; await g.pause() }
  const stale = f.apply()
  await g.waiting
  assert.equal((await f.apply()).status, 200)
  const approved = copy(f.records)
  g.release()
  assert.equal((await stale).status, 409)
  assert.deepEqual(f.records, approved)
  assert.equal(f.records.Events.syncVersion, 2)
})

test('без выбора применение и неизвестный публичный вариант отвергаются без записей', async () => {
  const f = fixture()
  f.records.Proposals.selectedPackageId = ''
  f.records.Proposals.selectedAt = null
  const before = copy(f.records)
  assert.equal((await f.apply()).body.error.code, 'selection_required')
  assert.equal((await f.select('missing')).status, 404)
  assert.deepEqual(f.records, before)
  assert.equal(f.writes.length, 0)
})

test('изоляция tenant/token/publicId, published status и expiry сохранены', async () => {
  const f = fixture()
  f.setTenant(foreign)
  assert.equal((await f.apply()).status, 404)
  f.setTenant(null)
  assert.equal((await f.apply()).status, 401)
  for (const params of [{ ...f.params, token: 'wrong' }, { ...f.params, publicId: 'wrong' }]) {
    assert.equal((await f.publicRoute.POST(f.req({ packageId: 'extended' }), { params })).status, 404)
    assert.equal((await f.publicRoute.GET(f.req({}), { params })).status, 404)
  }
  for (const status of ['draft', 'revoked', 'expired']) {
    f.records.Proposals.status = status
    assert.equal((await f.select('extended')).status, 410)
  }
  f.records.Proposals.status = 'published'
  f.records.Proposals.validUntil = new Date('2020-01-01')
  assert.equal((await f.select('extended')).status, 410)
  assert.equal(f.records.Proposals.selectedPackageId, 'basic')
  assert.equal(f.records.Proposals.selectionHistory.length, 0)
  assert.equal(f.pushes.length, 0)
  assert.equal(f.records.Events.additionalEvents.length, 0)
})


test('редактирование и клиентский выбор сверяют ревизию/выбор атомарно', async () => {
  const f = fixture()
  f.records.Proposals.clientSnapshot = { firstName: 'Анна' }
  f.hooks.updateProposals = () => { f.records.Proposals.selectedAt = new Date('2026-10-21') }
  const result = await f.edit({ title: 'Новый текст', messageText: 'Ок', contentRevision: 0 })
  assert.equal(result.status, 409)
  assert.equal(f.records.Proposals.title, 'КП')
  assert.equal(f.writes.length, 0)
  const g = fixture()
  g.hooks.saveProposals = () => { g.records.Proposals.contentRevision = 1 }
  const selection = await g.select('extended')
  assert.equal(selection.status, 409)
  assert.equal(g.records.Proposals.selectedPackageId, 'basic')
  assert.equal(g.pushes.length, 0)
  const h = fixture()
  h.hooks.updateProposals = () => { h.records.Proposals.contentRevision = 1 }
  assert.equal((await h.apply()).status, 409)
  assert.equal(h.records.Events.contractSum, 0)
})
