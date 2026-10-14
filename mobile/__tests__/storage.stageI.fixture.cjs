'use strict';
// Platform/transport seams only. All storage, outbox, remap, sync and clear code is real.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const mobile = path.resolve(__dirname, '..');
const ts = require(path.join(mobile, 'node_modules/typescript'));
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const bounded = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('DEADLOCK/SEAM_TIMEOUT')), 3000); })]); }
  finally { clearTimeout(timer); }
};
exports.turn = turn;
exports.bounded = bounded;
exports.fixture = async () => {
  for (const file of Object.keys(require.cache)) if (file.startsWith(path.join(mobile, 'src'))) delete require.cache[file];
  const originalLoad = Module._load;
  const originalTs = Module._extensions['.ts'];
  Module._extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, file);
  const raw = new DatabaseSync(':memory:');
  const secure = new Map();
  let online = false, uuid = 0, transactionGate, sqlGate, networkGate, identityGate, deletionProbe;
  const operations = [], sqlEvents = [], server = new Map();
  const gate = () => { const entered = deferred(), release = deferred(); return { entered: entered.promise, release: release.resolve, wait: release.promise, signal: entered.resolve }; };
  const db = {
    execAsync: async sql => { if (!sql.startsWith('PRAGMA key')) { raw.exec(sql); sqlEvents.push(sql); } },
    getFirstAsync: async (sql, ...args) => sql === 'PRAGMA cipher_version' ? { cipher_version: 'synthetic-platform-test' } : raw.prepare(sql).get(...args) || null,
    getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => {
      if (sqlGate && sqlGate.match(sql, args)) { const current = sqlGate; sqlGate = null; current.signal(); await current.wait; }
      const result = raw.prepare(sql).run(...args); sqlEvents.push({ sql, args });
      if (deletionProbe && sql.startsWith('DELETE FROM entity_cache')) { const probe = deletionProbe; deletionProbe = null; await probe(); }
      return result;
    },
    withTransactionAsync: async fn => {
      // Delay the adapter BEFORE BEGIN/actual SQL, exactly like an async native dispatch.
      // No product function is replaced, no write is followed by an artificial throw.
      if (transactionGate) { const current = transactionGate; transactionGate = null; current.signal(); await current.wait; }
      raw.exec('BEGIN');
      try { await fn(); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  Module._load = function(id, parent, isMain) {
    if (id === 'expo-crypto') return { randomUUID: () => `synthetic-${++uuid}` };
    if (id === 'expo-secure-store') return {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      getItemAsync: async key => {
        if (key === 'artistcrm_mobile_user' && identityGate) { const current = identityGate; identityGate = null; current.signal(); await current.wait; }
        return secure.get(key) || (key === 'artistcrm_database_key' ? 'synthetic-key' : null);
      },
      setItemAsync: async (key, value) => { secure.set(key, value); },
      deleteItemAsync: async key => { secure.delete(key); },
    };
    if (id === 'expo-file-system') return { Directory: class { exists = false; }, Paths: { document: 'unused' } };
    if (id === 'expo-sqlite') return { openDatabaseAsync: async () => db };
    if (id === '@react-native-community/netinfo') return { fetch: async () => ({ isConnected: online }) };
    if (id.endsWith('/api/client')) return { api: {
      get: async () => ({ data: { cursor: '', entities: {}, tombstones: [] } }),
      post: async (_path, body) => {
        const op = structuredClone(body.operations[0]); operations.push(op);
        if (networkGate) { const current = networkGate; networkGate = null; current.signal(); await current.wait; }
        const entityId = op.method === 'create' ? 'server-1' : op.entityId;
        if (op.method === 'delete') { server.delete(entityId); return { data: { results: [{ operationId: op.operationId, status: 'applied' }] } }; }
        if (op.method === 'update' && !server.has(entityId)) return { data: { results: [{ operationId: op.operationId, status: 'failed', error: { code: 'ENTITY_NOT_FOUND' } }] } };
        const entity = { ...(server.get(entityId) || {}), ...op.payload, _id: entityId, syncVersion: op.method === 'create' ? 2 : 3 };
        server.set(entityId, entity);
        return { data: { results: [{ operationId: op.operationId, status: 'applied', entityType: op.entityType, localEntityId: op.entityId, entity }] } };
      },
    } };
    if (id === './encryptedFiles' || id.endsWith('/storage/encryptedFiles')) return { syncFileQueue: async () => {} };
    return originalLoad.call(this, id, parent, isMain);
  };
  const load = file => require(path.join(mobile, 'src/shared', file));
  const auth = load('auth/tokenStore.ts');
  const session = async (user = { _id: 'u1', tenantId: 'tenant' }) => auth.setAuthSession({ user, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', tokenType: 'Bearer', expiresIn: 1 });
  await session();
  const database = load('storage/database.ts'), cache = load('storage/cache.ts'), mutations = load('storage/mutations.ts'), sync = load('sync/syncEngine.ts'), outbox = load('storage/outbox.ts');
  await database.getDatabase();
  return {
    ...database, ...cache, ...mutations, ...sync, ...outbox, auth, raw, db, operations, server, sqlEvents, session,
    online: value => { online = value; },
    delayTransaction: () => { transactionGate = gate(); return transactionGate; },
    delaySql: match => { sqlGate = { ...gate(), match }; return sqlGate; },
    delayNetwork: () => { networkGate = gate(); return networkGate; },
    delayIdentity: () => { identityGate = gate(); return identityGate; },
    onDeletion: probe => { deletionProbe = probe; },
    rows: (table = 'entity_cache') => raw.prepare(`SELECT * FROM ${table}`).all(),
    close: () => { Module._load = originalLoad; Module._extensions['.ts'] = originalTs; raw.close(); },
  };
};
