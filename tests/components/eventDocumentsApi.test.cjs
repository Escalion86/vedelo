const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')

async function fixture() {
  await loadBindings()
  const normalization = await import('../../server/eventApiNormalization.js')
  const documents = await import('../../helpers/entityDocuments.js')
  const state = { tenantId: 'tenant-a', allowDocuments: true, stored: null }
  const doc = (data) => ({ ...data, toJSON: () => data })
  const Events = {
    create: async (data) => {
      state.stored = { ...data, _id: 'event-1' }
      return doc(state.stored)
    },
    findById: () => ({ lean: async () => state.stored }),
    findOne: (filter) => ({
      lean: async () =>
        filter.tenantId === state.stored?.tenantId ? state.stored : null,
    }),
    findOneAndUpdate: async (filter, update) => {
      assert.equal(filter.tenantId, state.stored.tenantId)
      state.stored = { ...state.stored, ...update }
      return doc(state.stored)
    },
    findByIdAndUpdate: async (_id, update) => {
      state.stored = { ...state.stored, ...update }
      return doc(state.stored)
    },
  }
  const mocks = {
    'next/server': {
      NextResponse: {
        json: (body, options) => ({ body, status: options.status }),
      },
    },
    '@models/Events': Events,
    '@server/dbConnect': async () => {},
    '@server/getRequestContext': async () => ({
      tenantId: state.tenantId,
      user: state.tenantId ? { _id: 'user' } : null,
    }),
    '@server/getUserTariffAccess': async () => ({
      hasTariff: true,
      eventsPerMonth: Infinity,
      allowDocuments: state.allowDocuments,
    }),
    '@server/eventApiNormalization': normalization,
    '@helpers/entityDocuments': documents,
    '@server/tenantTerminology': {
      getTenantWorkItemTerminology: async () => ({
        labelCapitalized: 'Заказ',
        mode: 'orders',
      }),
    },
    '@server/activityHistory': { recordActivityHistory: async () => {} },
    '@server/acquisitionFunnel': { recordCrmItemCreated: async () => {} },
    '@helpers/compareObjectsWithDif': () => ({}),
  }
  const load = (filename) => {
    const { code } = transformSync(readFileSync(filename, 'utf8'), {
      filename,
      jsc: { parser: { syntax: 'ecmascript' } },
      module: { type: 'commonjs' },
    })
    const mod = { exports: {} }
    new Function('require', 'module', 'exports', code)(
      (id) => (id in mocks ? mocks[id] : id.startsWith('@') ? {} : require(id)),
      mod,
      mod.exports
    )
    return mod.exports
  }
  const { POST } = load('app/api/events/route.js')
  const { GET, PUT } = load('app/api/events/[id]/route.js')
  const params = { params: Promise.resolve({ id: 'event-1' }) }
  return {
    state,
    create: (body) => POST({ json: async () => body }),
    update: (body) => PUT({ json: async () => body }, params),
    read: () => GET({}, params),
  }
}

const link = { id: 'brief', type: 'other', url: 'https://example.test/brief' }

test('draft attachments survive creation, editing and status/contract changes', async () => {
  const f = await fixture()
  assert.equal(
    (await f.create({ status: 'draft', documents: [link] })).status,
    201
  )
  assert.equal((await f.update({ description: 'Новые детали' })).status, 200)
  for (const status of ['active', 'draft', 'canceled', 'draft']) {
    assert.equal((await f.update({ status, isByContract: false })).status, 200)
    const { body } = await f.read()
    assert.equal(body.data.documents[0].url, link.url)
  }
})

test('tariff forbids both canonical and legacy attachments on create/update', async () => {
  const f = await fixture()
  await f.create({ status: 'draft' })
  f.state.allowDocuments = false
  for (const payload of [
    { documents: [link] },
    { documentFiles: [{ name: 'brief.pdf', url: link.url }] },
    ...['contractLinks', 'invoiceLinks', 'receiptLinks', 'actLinks'].map(
      (key) => ({ [key]: [link.url] })
    ),
  ]) {
    const before = structuredClone(f.state.stored)
    assert.equal((await f.create({ status: 'active', ...payload })).status, 403)
    assert.equal((await f.update(payload)).status, 403)
    assert.deepEqual(f.state.stored, before)
  }
})

test('existing private keys survive update, new or foreign keys are rejected', async () => {
  const f = await fixture()
  const storedDocument = {
    id: 'private',
    type: 'other',
    file: {
      name: 'brief.pdf',
      storageKey: 'vedelo/tenant-a/events/event-1/documents/private',
    },
  }
  assert.equal(
    (await f.create({ status: 'draft', documents: [storedDocument] })).status,
    201
  )
  assert.deepEqual(f.state.stored.documents, [])
  // Имитируем результат защищённого upload endpoint, а не клиентского JSON.
  f.state.stored.documents = [storedDocument]
  const foreign = {
    ...storedDocument,
    id: 'foreign',
    file: {
      ...storedDocument.file,
      storageKey: 'vedelo/tenant-b/events/other/documents/private',
    },
  }
  assert.equal(
    (await f.update({ documents: [storedDocument, foreign] })).status,
    200
  )
  assert.equal(f.state.stored.documents.length, 1)
  assert.equal(
    f.state.stored.documents[0].file.storageKey,
    storedDocument.file.storageKey
  )
  const before = structuredClone(f.state.stored)
  f.state.tenantId = 'tenant-b'
  assert.equal((await f.read()).status, 404)
  assert.equal((await f.update({ documents: [] })).status, 404)
  assert.deepEqual(f.state.stored, before)
  f.state.tenantId = null
  assert.equal((await f.create({ documents: [link] })).status, 401)
  assert.equal((await f.update({ documents: [] })).status, 401)
})
