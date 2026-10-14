import { withLocalDataClear } from './localEntityCoordination'
import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import * as SQLite from 'expo-sqlite'
import { Directory, Paths } from 'expo-file-system'
import {
  assertSqlCipherAvailable,
  runDatabaseMigrations,
} from './databaseMigrations'

const DATABASE_NAME = 'artistcrm.db'
const DATABASE_KEY = 'artistcrm_database_key'

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null

export type StartupRecoverySummary = {
  outboxOperations: number
  files: number
}

let startupRecoverySummary: StartupRecoverySummary = {
  outboxOperations: 0,
  files: 0,
}

const getDatabaseKey = async () => {
  const existing = await SecureStore.getItemAsync(DATABASE_KEY)
  if (existing) return existing
  const key = `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replaceAll('-', '')
  await SecureStore.setItemAsync(DATABASE_KEY, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  })
  return key
}

const initializeDatabase = async () => {
  const [database, key] = await Promise.all([
    SQLite.openDatabaseAsync(DATABASE_NAME),
    getDatabaseKey(),
  ])
  const safeKey = key.replaceAll("'", "''")
  await database.execAsync(`PRAGMA key = '${safeKey}';`)
  const cipher = await database.getFirstAsync<{ cipher_version?: string }>(
    'PRAGMA cipher_version'
  )
  assertSqlCipherAvailable(cipher?.cipher_version)
  await database.execAsync(
    'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;'
  )
  await runDatabaseMigrations(database)
  const now = new Date().toISOString()
  let recoveredOutboxOperations = 0
  let recoveredFiles = 0
  await database.withTransactionAsync(async () => {
    const outboxResult = await database.runAsync(
      `UPDATE outbox SET status = 'failed', next_retry_at = NULL,
       last_error = COALESCE(last_error, 'Синхронизация прервана'), updated_at = ?
       WHERE status = 'syncing'`,
      now
    )
    recoveredOutboxOperations = outboxResult.changes
    const filesResult = await database.runAsync(
      `UPDATE file_queue SET status = 'failed',
       next_retry_at = NULL,
       last_error = COALESCE(last_error, 'Отправка прервана'), updated_at = ?
       WHERE status = 'uploading'`,
      now
    )
    recoveredFiles = filesResult.changes
    await database.runAsync(
      `UPDATE sync_state SET status = 'interrupted',
       last_failure_at = ?, last_error_code = 'interrupted',
       consecutive_failures = consecutive_failures + 1, updated_at = ?
       WHERE scope = 'global' AND status = 'syncing'`,
      now,
      now
    )
  })
  startupRecoverySummary = {
    outboxOperations: recoveredOutboxOperations,
    files: recoveredFiles,
  }
  return database
}

export const getDatabase = () => {
  if (!databasePromise) databasePromise = initializeDatabase()
  return databasePromise
}

export const getStartupRecoverySummary = (): StartupRecoverySummary => ({
  ...startupRecoverySummary,
})

export const clearLocalData = () => withLocalDataClear(async () => {
  const database = await getDatabase()
  await database.withTransactionAsync(async () => {
    await database.execAsync(`
      DELETE FROM entity_cache;
      DELETE FROM outbox;
      DELETE FROM sync_conflicts;
      DELETE FROM sync_cursors;
      DELETE FROM file_queue;
      DELETE FROM sync_state;
    `)
  })
  try {
    const encryptedFiles = new Directory(Paths.document, 'encrypted-files')
    if (encryptedFiles.exists) encryptedFiles.delete()
  } catch {
    // Database rows are already gone; an orphaned encrypted blob contains no plaintext.
  }
  startupRecoverySummary = { outboxOperations: 0, files: 0 }
})
