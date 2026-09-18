const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { MongoClient, ObjectId } = require('mongoose').mongo
const { mergeClientFullNames } = require('./mergeClientFullNames.js')

test('ФИО записывается в MongoDB; dry-run, tenant isolation и повторный запуск', {
  skip: !process.env.TEST_MONGODB_URI,
}, async () => {
  const client = new MongoClient(process.env.TEST_MONGODB_URI)
  const name = `vedelo_merge_names_test_${randomUUID().replaceAll('-', '')}`
  await client.connect()
  const db = client.db(name)
  try {
    const tenantId = new ObjectId()
    const otherId = new ObjectId()
    const rows = [
      { _id: new ObjectId(), tenantId, firstName: 'Имя', secondName: 'Фамилия', thirdName: 'Отчество', syncVersion: 4, note: 'keep' },
      { _id: new ObjectId(), tenantId, firstName: 'Имя Фамилия', secondName: 'Фамилия' },
      { _id: new ObjectId(), tenantId, firstName: 'Готовое имя', secondName: '', thirdName: '' },
      { _id: new ObjectId(), tenantId: otherId, firstName: 'Чужое', secondName: 'Имя' },
      { _id: new ObjectId(), firstName: 'Без организации', secondName: 'Имя' },
    ]
    await db.collection('clients').insertMany(rows)
    assert.equal((await mergeClientFullNames(db, { tenantId })).planned, 2)
    assert.deepEqual(await db.collection('clients').find({ tenantId }).toArray(), rows.slice(0, 3))
    const result = await mergeClientFullNames(db, { tenantId, apply: true })
    assert.deepEqual(result, { mode: 'apply', planned: 2, modified: 2, conflicts: 0 })
    const updated = await db.collection('clients').findOne({ _id: rows[0]._id, tenantId })
    assert.equal(updated.firstName, 'Имя Фамилия Отчество')
    assert.equal(updated.secondName, '')
    assert.equal(updated.thirdName, '')
    assert.equal(updated.syncVersion, 5)
    assert.equal(updated.note, 'keep')
    assert.ok(updated.updatedAt instanceof Date)
    const duplicate = await db.collection('clients').findOne({ _id: rows[1]._id, tenantId })
    assert.equal(duplicate.firstName, 'Имя Фамилия')
    assert.equal(duplicate.syncVersion, 1)
    assert.deepEqual(await db.collection('clients').findOne({ tenantId: otherId }), rows[3])
    assert.equal((await mergeClientFullNames(db, { tenantId, apply: true })).modified, 0)
    assert.deepEqual(await db.collection('clients').findOne({ _id: rows[0]._id, tenantId }), updated)
    assert.equal((await mergeClientFullNames(db, { apply: true })).modified, 1)
    assert.deepEqual(await db.collection('clients').findOne({ _id: rows[4]._id, tenantId: { $exists: false } }), rows[4])
    // Изменение другим клиентом между чтением и записью не перетирается.
    await db.collection('clients').updateOne({ _id: rows[0]._id, tenantId }, { $set: { secondName: 'До' } })
    const realCollection = db.collection('clients')
    const concurrentDb = { collection: () => ({
      find: (...args) => realCollection.find(...args),
      bulkWrite: async (ops) => {
        await realCollection.updateOne({ _id: rows[0]._id, tenantId }, { $set: { secondName: 'После' } })
        return realCollection.bulkWrite(ops)
      },
    }) }
    assert.equal((await mergeClientFullNames(concurrentDb, { tenantId, apply: true })).conflicts, 1)
    assert.equal((await realCollection.findOne({ _id: rows[0]._id, tenantId })).secondName, 'После')
  } finally {
    if (/^vedelo_merge_names_test_[a-f0-9]{32}$/.test(name)) await db.dropDatabase()
    await client.close()
  }
})
