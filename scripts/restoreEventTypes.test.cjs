const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { MongoClient, ObjectId } = require('mongoose').mongo
const { parseArgs, restoreEventTypes } = require('./restoreEventTypes.cjs')

test('требуется явный выбор аккаунта; некорректные аргументы запрещены', () => {
  for (const args of [[], ['--tenant=bad'], ['--all', '--developer'], ['--apply']])
    assert.throws(() => parseArgs(args))
  assert.equal(parseArgs(['--developer']).apply, false)
})

test('восстановление изолировано по tenant, сохраняет настройки и идемпотентно', {
  skip: !process.env.TEST_MONGODB_URI,
}, async () => {
  const client = new MongoClient(process.env.TEST_MONGODB_URI)
  const dbName = `vedelo_restore_types_test_${randomUUID().replaceAll('-', '')}`
  await client.connect()
  const db = client.db(dbName)
  try {
    const tenantId = new ObjectId()
    const otherId = new ObjectId()
    await db.collection('users').insertMany([
      { _id: tenantId, role: 'dev' }, { _id: otherId, role: 'user' },
    ])
    await db.collection('sitesettings').createIndex({ tenantId: 1 }, { unique: true })
    await db.collection('sitesettings').insertOne({
      tenantId, custom: { eventTypes: ['Свадьба', 'Неиспользованный'], keep: true }, syncVersion: 5,
    })
    await db.collection('events').insertMany([
      { tenantId, eventType: ' Свадьба ' },
      { tenantId, eventType: 'Корпоратив' },
      { tenantId, eventType: 'Корпоратив' },
      { tenantId, eventType: ' ' },
      { tenantId, eventType: null },
      { tenantId, eventType: 'Учебный', isDemo: true },
      { tenantId: otherId, eventType: 'Чужой' },
    ])
    const before = await db.collection('sitesettings').findOne({ tenantId })
    const eventsBefore = await db.collection('events').find({ tenantId }).toArray()
    const dryRun = await restoreEventTypes(db, { tenantId })
    assert.equal(dryRun.typesToAdd, 1)
    assert.deepEqual(await db.collection('sitesettings').findOne({ tenantId }), before)
    const applied = await restoreEventTypes(db, { tenantId, apply: true })
    assert.equal(applied.accountsUpdated, 1)
    const after = await db.collection('sitesettings').findOne({ tenantId })
    assert.deepEqual(after.custom, {
      eventTypes: ['Свадьба', 'Неиспользованный', 'Корпоратив'], keep: true,
    })
    assert.equal(after.syncVersion, 6)
    assert.equal(await db.collection('sitesettings').countDocuments({ tenantId: otherId }), 0)
    assert.deepEqual(await db.collection('events').find({ tenantId }).toArray(), eventsBefore)
    assert.equal((await restoreEventTypes(db, { tenantId, apply: true })).accountsUpdated, 0)
    assert.deepEqual(await db.collection('sitesettings').findOne({ tenantId }), after)
    // Настройки отсутствуют — создаются только для выбранного tenant.
    assert.equal((await restoreEventTypes(db, { tenantId: otherId, apply: true })).accountsUpdated, 1)
    assert.deepEqual((await db.collection('sitesettings').findOne({ tenantId: otherId })).custom.eventTypes, ['Чужой'])
    // Справочник отсутствует, остальные настройки должны остаться.
    await db.collection('sitesettings').updateOne({ tenantId }, { $unset: { 'custom.eventTypes': '' } })
    await restoreEventTypes(db, { developer: true, apply: true })
    const restored = await db.collection('sitesettings').findOne({ tenantId })
    assert.equal(restored.custom.keep, true)
    assert.deepEqual(restored.custom.eventTypes, ['Корпоратив', 'Свадьба'])
    // Повреждённое значение не заменяем молча.
    await db.collection('sitesettings').updateOne({ tenantId }, { $set: { 'custom.eventTypes': null } })
    await assert.rejects(restoreEventTypes(db, { tenantId, apply: true }))
  } finally {
    if (/^vedelo_restore_types_test_[a-f0-9]{32}$/.test(dbName)) await db.dropDatabase()
    await client.close()
  }
})
