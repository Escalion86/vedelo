'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, bounded, turn } = require('./storage.stageI.fixture.cjs');
const scenario = (name, fn) => test(name, { timeout: 10000 }, async () => {
  const f = await fixture();
  try { await bounded(fn(f)); } finally { f.close(); }
});
const create = async f => {
  const local = await f.saveLocalEntity({ entityType: 'events', values: { title: 'Первый ввод', documents: [{ entityId: 'attachment-owner' }] } });
  await f.runSync(); return local;
};
const assertSaved = async (f, local) => {
  await f.runSync();
  assert.deepEqual(f.operations.map(op => [op.method, op.entityId]), [['create', local._id], ['update', 'server-1']], 'save/remap must send one create then update(server-ID)');
  assert.equal((await f.getCachedEntity('events', local._id)).title, 'Исправленный ввод', 'remap must retain edited input');
  assert.equal(f.rows().filter(row => row.entity_type === 'events').length, 1, 'local cache must not resurrect');
  assert.equal(f.server.get('server-1').title, 'Исправленный ввод');
};
scenario('A-LOCAL-ID-01 save first: read local, delay actual SQL, applied remap competes', async f => {
  const local = await create(f), network = f.delayNetwork();
  f.online(true); const syncing = f.runSync(); await bounded(network.entered);
  const sql = f.delayTransaction();
  const saving = f.saveLocalEntity({ entityType: 'events', entityId: local._id, values: { title: 'Исправленный ввод' } });
  await bounded(sql.entered); network.release(); await turn(); await turn(); sql.release();
  await Promise.all([saving, syncing]); await assertSaved(f, local);
});
scenario('A-LOCAL-ID-01 remap first: delayed server SQL, concurrent save resolves current ID/version', async f => {
  const local = await create(f), sql = f.delayTransaction();
  f.online(true); const syncing = f.runSync(); await bounded(sql.entered);
  const saving = f.saveLocalEntity({ entityType: 'events', entityId: local._id, values: { title: 'Исправленный ввод' } });
  await turn(); sql.release(); await Promise.all([saving, syncing]); await assertSaved(f, local);
  assert.equal(f.operations[1].baseVersion, '2');
});
scenario('A-LOCAL-ID-DELETE sequential alias deletes server and uses original delete DTO', async f => {
  const local = await create(f); f.online(true); await f.runSync();
  await f.deleteLocalEntity('events', local._id); await f.runSync();
  assert.equal(await f.getCachedEntity('events', 'server-1'), null, 'alias delete must remove server cache');
  const deletion = f.operations.find(op => op.method === 'delete');
  assert.ok(deletion, 'alias delete must enqueue server deletion');
  assert.equal(deletion.entityId, 'server-1'); assert.equal(deletion.baseVersion, '2');
  assert.deepEqual(deletion.payload, {}); assert.equal(deletion.baseValues, null); assert.deepEqual(deletion.attachments, []);
});
scenario('A-LOCAL-ID-DELETE delete first: delayed local DELETE races an in-flight create result', async f => {
  const local = await create(f), network = f.delayNetwork(); f.online(true);
  const syncing = f.runSync(); await bounded(network.entered);
  const sql = f.delaySql((statement, args) => statement.startsWith('DELETE FROM entity_cache') && args[1] === local._id);
  const deleting = f.deleteLocalEntity('events', local._id); await bounded(sql.entered);
  network.release(); await turn(); await turn(); sql.release(); await Promise.all([deleting, syncing]); await f.runSync();
  assert.equal(await f.getCachedEntity('events', 'server-1'), null, 'delete/remap must not resurrect deleted entity');
  assert.deepEqual(f.operations.map(op => op.method), ['create', 'delete']); assert.equal(f.operations[1].entityId, 'server-1');
});
scenario('A-LOCAL-ID-DELETE remap first: delayed server SQL races deletion through local route', async f => {
  const local = await create(f), sql = f.delayTransaction(); f.online(true);
  const syncing = f.runSync(); await bounded(sql.entered);
  const deleting = f.deleteLocalEntity('events', local._id); await turn(); sql.release();
  await Promise.all([deleting, syncing]); await f.runSync();
  assert.equal(await f.getCachedEntity('events', 'server-1'), null, 'remap/delete must remove server entity');
  assert.equal(f.operations.filter(op => op.method === 'delete' && op.entityId === 'server-1').length, 1);
});
scenario('A-LOCAL-ID-DELETE unsynced local create still discards without server delete', async f => {
  const local = await create(f); await f.deleteLocalEntity('events', local._id); await f.runSync();
  assert.equal(f.rows('outbox').length, 0); assert.equal(f.operations.length, 0); assert.equal(await f.getCachedEntity('events', local._id), null);
});
scenario('A-LOCAL-ID-SESSION delayed actual server SQL finishes before successful clear; new data survives', async f => {
  await create(f); const sql = f.delayTransaction(); f.online(true);
  const syncing = f.runSync(); await bounded(sql.entered);
  await f.session({ _id: 'u2', tenantId: 'other' });
  let cleared = false; const clearing = f.clearLocalData().then(() => { cleared = true; });
  await turn(); await turn(); const clearedBeforeSql = cleared;
  f.online(false); const newSaving = f.saveLocalEntity({ entityType: 'events', values: { title: 'Новая сессия' } });
  // If baseline clear returned early, finish new-session SQL before releasing old SQL.
  // With correct draining, the new write stays queued after clear (no nested native transaction).
  if (clearedBeforeSql) await newSaving;
  sql.release(); await Promise.all([syncing, clearing]);
  const fresh = await newSaving; await f.runSync();
  assert.equal(await f.getCachedEntity('events', 'server-1'), null, 'old actual SQL cannot survive replacement-session clear');
  assert.equal(clearedBeforeSql, false, 'successful clear must drain already dispatched old SQL');
  assert.equal((await f.getCachedEntity('events', fresh._id)).title, 'Новая сессия');
  assert.equal(f.rows().filter(row => row.entity_type.startsWith('__local_id_map:')).length, 0);
  assert.equal(f.rows('outbox').length, 1);
});
scenario('A-LOCAL-ID-SESSION same identity clear invalidates delayed network applied via epoch', async f => {
  const local = await create(f), network = f.delayNetwork(); f.online(true);
  const syncing = f.runSync(); await bounded(network.entered);
  await f.clearLocalData(); network.release(); await syncing;
  assert.equal(await f.getCachedEntity('events', 'server-1'), null, 'clear epoch must invalidate old applied even for same identity');
  assert.equal(await f.getCachedEntity('events', local._id), null);
});
scenario('A-LOCAL-ID-SESSION async local-create identity capture cannot adopt replacement session after clear', async f => {
  await create(f); const identity = f.delayIdentity(); f.online(true);
  const syncing = f.runSync(); await bounded(identity.entered);
  await f.session({ _id: 'u2', tenantId: 'other' }); await f.clearLocalData();
  identity.release(); await syncing;
  assert.equal(await f.getCachedEntity('events', 'server-1'), null, 'identity capture must include initiating clear epoch');
  assert.equal(f.operations.length, 0, 'stale local create capture must fail before network');
});
scenario('A-LOCAL-ID-SESSION delayed save SQL + clear drains old writes and preserves subsequent data', async f => {
  const local = await create(f), sql = f.delayTransaction();
  const saving = f.saveLocalEntity({ entityType: 'events', entityId: local._id, values: { title: 'Старый ввод' } }).catch(error => error);
  await bounded(sql.entered); await f.session({ _id: 'u2', tenantId: 'other' });
  const clearing = f.clearLocalData(); await turn(); sql.release(); await Promise.all([saving, clearing]); await f.runSync();
  assert.equal(f.rows('outbox').length, 0, 'save outbox must not outlive clear');
  assert.equal(f.rows().filter(row => row.entity_type === 'events').length, 0, 'save actual SQL must not outlive clear');
  const fresh = await create(f); assert.ok(await f.getCachedEntity('events', fresh._id));
});
scenario('A-LOCAL-ID-01 reentrant cache lookup and real attachment/pending-reference remap complete without deadlock', async f => {
  const local = await create(f);
  await f.upsertEntities('clients', [{ _id: 'client', eventId: local._id }]);
  await f.enqueueOperation({ entityType: 'clients', entityId: 'client', method: 'update', payload: { eventId: local._id }, baseValues: { eventId: local._id }, attachments: [{ entityId: local._id }] });
  await f.db.runAsync("UPDATE outbox SET next_retry_at = '2099-01-01' WHERE entity_type = 'clients'");
  await f.db.runAsync("INSERT INTO file_queue (id, operation_id, local_uri, entity_type, entity_id, status, created_at, updated_at) VALUES ('file','synthetic-operation','synthetic','events',?,'pending','now','now')", local._id);
  let probed = false;
  f.onDeletion(async () => { assert.equal((await f.getCachedEntity('events', local._id))._id, 'server-1'); probed = true; });
  f.online(true); await f.runSync(); assert.ok(probed);
  const reference = f.rows('outbox').find(row => row.entity_type === 'clients');
  assert.equal(JSON.parse(reference.payload).eventId, 'server-1'); assert.equal(JSON.parse(reference.base_values).eventId, 'server-1'); assert.equal(JSON.parse(reference.attachments)[0].entityId, 'server-1');
  assert.equal((await f.getCachedEntity('clients', 'client')).eventId, 'server-1'); assert.equal(f.rows('file_queue')[0].entity_id, 'server-1');
});
scenario('A-LOCAL-ID-01 pending create changed while identity capture waits sends latest local input', async f => {
  const local = await create(f), identity = f.delayIdentity(); f.online(true);
  const syncing = f.runSync(); await bounded(identity.entered);
  await f.saveLocalEntity({ entityType: 'events', entityId: local._id, values: { title: 'Правка до отправки' } });
  identity.release(); await syncing;
  assert.deepEqual(f.operations.map(op => op.method), ['create']);
  assert.equal(f.operations[0].payload.title, 'Правка до отправки', 'capture must reread the real pending create before network');
  assert.equal((await f.getCachedEntity('events', 'server-1')).title, 'Правка до отправки');
});
scenario('A-LOCAL-ID-DELETE pending create deleted while identity capture waits is never sent', async f => {
  const local = await create(f), identity = f.delayIdentity(); f.online(true);
  const syncing = f.runSync(); await bounded(identity.entered);
  await f.deleteLocalEntity('events', local._id);
  identity.release(); await syncing;
  assert.equal(f.operations.length, 0, 'deleted unsent create must remain discarded, with no server create/delete');
  assert.equal(f.rows('outbox').length, 0); assert.equal(await f.getCachedEntity('events', local._id), null);
});
