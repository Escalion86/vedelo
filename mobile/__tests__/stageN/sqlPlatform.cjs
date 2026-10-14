'use strict'
// Только Expo SQL/SecureStore/filesystem/UUID seams. Schema, cache, queue,
// identity, save, outbox, merge и clear всегда импортируются из продукта.
const { DatabaseSync } = require('node:sqlite')
const raw = new DatabaseSync(':memory:')
const secure = new Map(), statements = []
let uuid = 0, sqlGate, identityGate
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const gate = () => { const entered = deferred(), released = deferred(); return { entered: entered.promise, signal: entered.resolve, wait: released.promise, release: released.resolve } }
const sqlite = {
  execAsync: async sql => { statements.push({ kind: 'exec', sql }); if (!sql.startsWith('PRAGMA key')) raw.exec(sql) },
  getFirstAsync: async (sql, ...args) => sql === 'PRAGMA cipher_version' ? { cipher_version: 'test-platform-only' } : raw.prepare(sql).get(...args) || null,
  getAllAsync: async (sql, ...args) => raw.prepare(sql).all(...args),
  runAsync: async (sql, ...args) => {
    if (sqlGate && sqlGate.match(sql, args)) { const g = sqlGate; sqlGate = null; g.signal(); await g.wait }
    const result = raw.prepare(sql).run(...args); statements.push({ kind: 'write', sql }); return result
  },
  withTransactionAsync: async fn => {
    raw.exec('BEGIN'); try { await fn(); raw.exec('COMMIT') } catch (e) { raw.exec('ROLLBACK'); throw e }
  },
}
const secureStore = {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async key => {
    if (identityGate && key === 'artistcrm_mobile_user') { const g = identityGate; identityGate = null; g.signal(); await g.wait }
    return secure.get(key) || null
  },
  setItemAsync: async (key, value) => { secure.set(key, value) },
  deleteItemAsync: async key => { secure.delete(key) },
}
class Directory { exists = false; delete() {} }
class File { exists = false }
module.exports = {
  sqlite, secureStore, files: { Directory, File, Paths: { document: 'synthetic-document', cache: 'synthetic-cache' } },
  randomUUID: () => `stage-n-${++uuid}`,
  delaySql: match => (sqlGate = { ...gate(), match }),
  delayIdentity: () => (identityGate = gate()),
  rows: table => raw.prepare(`SELECT * FROM ${table}`).all(),
  statements, close: () => raw.close(),
}
