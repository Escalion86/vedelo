// Platform adapter only: exercise production cache/coordination/creationStore
// against real SQLite in Node. SQLCipher encryption itself is tested on Android.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite')
module.exports = () => {
  const db = new DatabaseSync(':memory:')
  return {
    execAsync: async sql => { if (!sql.startsWith('PRAGMA key')) db.exec(sql) },
    getFirstAsync: async (sql, ...args) => sql === 'PRAGMA cipher_version' ? { cipher_version: 'test-platform-cipher' } : db.prepare(sql).get(...args) || null,
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
    withTransactionAsync: async work => { db.exec('BEGIN'); try { await work(); db.exec('COMMIT') } catch (error) { db.exec('ROLLBACK'); throw error } },
  }
}
