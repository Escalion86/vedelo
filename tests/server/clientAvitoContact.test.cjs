const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { loadBindings, transformSync } = require('next/dist/build/swc')
const { NextResponse } = require('next/server')
const avito = require('../../helpers/avitoContact.mjs')
const url = 'https://www.avito.ru/user/b05f7c5ce6ff0dd28f25e72b6564c023/profile?id=1054645663&iid=1054645663&page_from=from_item_messenger&src=messenger'
const load = (file, mocks) => {
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), { filename: file,
    jsc: { parser: { syntax: 'ecmascript', jsx: true } }, module: { type: 'commonjs' } })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => id in mocks ? mocks[id] : require(id), loaded, loaded.exports)
  return loaded.exports
}
test.before(async () => loadBindings())

test('Avito сохраняет параметры профиля и отклоняет чужие/опасные адреса', () => {
  assert.equal(avito.normalizeAvitoContactUrl(` ${url} `), url)
  assert.equal(avito.normalizeAvitoContactUrl('avito.ru/user/test/profile'), 'https://avito.ru/user/test/profile')
  for (const value of ['javascript:alert(1)', 'https://avito.ru.evil.test/user/test/profile', 'https://evil.test/user/test/profile', 'https://avito.ru@evil.test/user/test/profile', 'https://name@avito.ru/user/test/profile', 'https://avito.ru:444/user/test/profile', 'https://avito.ru/redirect?to=https://evil.test', 'https://avito.ru/', 'http://avito.ru/user/test/profile', {}, 7]) {
    assert.equal(avito.isValidAvitoContactUrl(value), false)
    assert.equal(avito.normalizeAvitoContactUrl(value), '')
  }
  assert.equal(avito.isValidAvitoContactUrl(''), true)
})

test('schema хранит Avito и приоритет, валидирует ссылку', async () => {
  const mongoose = require('mongoose')
  const schema = load('schemas/clientsSchema.js', {
    '@helpers/constants': { DEFAULT_USERS_NOTIFICATIONS: {} },
    '@helpers/maxContact': { isValidMaxContact: () => true },
    '@helpers/avitoContact.mjs': avito,
    './documentSchema': new mongoose.Schema({}),
  }).default
  const Model = mongoose.models.AvitoContactTest || mongoose.model('AvitoContactTest', new mongoose.Schema(schema))
  const client = new Model({ avitoUrl: url, preferredContactChannel: 'avito' })
  await client.validate()
  assert.equal(client.avitoUrl, url)
  await assert.rejects(new Model({ avitoUrl: 'https://evil.test' }).validate(), (error) => Boolean(error.errors.avitoUrl))
})

test('client POST/PUT: create, update, clear, validation and tenant isolation', async () => {
  let context = { tenantId: 'own', user: { _id: 'own' } }
  let writes = []
  const stored = { _id: 'client', tenantId: 'own', avitoUrl: url }
  const mocks = {
    'next/server': { NextResponse }, '@helpers/avitoContact.mjs': avito,
    '@models/Clients': {
      findOne: (filter) => ({ lean: async () => filter._id === stored._id && filter.tenantId === stored.tenantId ? stored : null }),
      findOneAndUpdate: async (filter, update) => { writes.push({ filter, update }); return { ...stored, ...update } },
    },
    '@models/Events': {}, '@models/Transactions': {},
    '@server/dbConnect': async () => {}, '@server/getRequestContext': async () => context,
    '@server/getUserTariffAccess': async () => ({}),
    '@server/activityHistory': { recordActivityHistory: async () => {} },
    '@server/tenantSafeUpdate': { buildTenantSafeUpdate: (value) => { const { tenantId, _id, ...rest } = value; return rest } },
    '@helpers/clientMessengerAvailability': load('helpers/clientMessengerAvailability.js', {}),
    '@helpers/entityDocuments': { normalizeEntityDocuments: () => [], entityHasDocuments: () => false, getDocumentStorageKeys: () => [] },
    '@server/mobile/sync': { withSyncVersionIncrement: (value) => value, recordSyncTombstone: async () => {} },
    '@server/clientCreation': { createClientOnce: async (value) => { writes.push(value); return { data: { ...value.body, tenantId: value.tenantId, _id: 'new' }, created: true } } },
  }
  const putRoute = load('app/api/clients/[id]/route.js', mocks)
  const postRoute = load('app/api/clients/route.js', mocks)
  const request = (body) => new Request('http://localhost/api/clients', { method: 'POST', body: JSON.stringify(body) })
  const put = (body, id = 'client') => putRoute.PUT(request(body), { params: Promise.resolve({ id }) })
  assert.equal((await postRoute.POST(request({ avitoUrl: ` ${url} `, preferredContactChannel: 'avito' }))).status, 201)
  assert.equal(writes[0].body.avitoUrl, url)
  assert.equal((await put({ avitoUrl: url, preferredContactChannel: 'avito', tenantId: 'foreign' })).status, 200)
  assert.deepEqual(writes.at(-1).filter, { _id: 'client', tenantId: 'own' })
  assert.equal(writes.at(-1).update.preferredContactChannel, 'avito')
  assert.equal((await put({ avitoUrl: '' })).status, 200)
  assert.equal(writes.at(-1).update.avitoUrl, '')
  assert.equal((await put({ phone: 79997654321, telegramPhone: 79991234567 })).status, 200)
  assert.equal(writes.at(-1).update.telegramPhone, 79991234567)
  assert.deepEqual(writes.at(-1).filter, { _id: 'client', tenantId: 'own' })
  writes = []
  for (const value of ['https://evil.test', { url }]) {
    assert.equal((await put({ avitoUrl: value })).status, 400)
    assert.equal((await postRoute.POST(request({ avitoUrl: value }))).status, 400)
  }
  assert.equal((await put({ avitoUrl: url }, 'foreign')).status, 404)
  context = { tenantId: 'foreign', user: { _id: 'foreign' } }
  assert.equal((await put({ avitoUrl: url })).status, 404)
  assert.equal((await put({ telegramPhone: 79991234567 })).status, 404)
  context = {}
  assert.equal((await put({ avitoUrl: url })).status, 401)
  assert.equal((await postRoute.POST(request({ avitoUrl: url }))).status, 401)
  assert.equal(writes.length, 0)
})
