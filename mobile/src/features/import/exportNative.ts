import { File, Paths } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import * as Sharing from 'expo-sharing'
import type { ExportKey } from './exportDatasets'

export type ShareResult = { opened: boolean; error: boolean; cleanupFailed: boolean }
export async function shareExportCsv(key: ExportKey, csv: string, current: () => boolean): Promise<ShareResult> {
  let file: File | null = null
  let ownsFile = false
  const result: ShareResult = { opened: false, error: false, cleanupFailed: false }
  try {
    if (!current()) return result
    if (!await Sharing.isAvailableAsync()) throw new Error('SHARE_UNAVAILABLE')
    if (!current()) return result
    file = new File(Paths.cache, `vedelo-${key}-${randomUUID()}.csv`)
    if (file.exists) throw new Error('TEMP_FILE_COLLISION')
    ownsFile = true
    file.create({ intermediates: true }) // Never overwrite a pre-existing file.
    file.write(csv)
    if (!current()) return result
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Экспорт Ведело' })
    // expo-sharing returns void on Android, including dismiss/cancel.
    result.opened = true
  } catch { result.error = true }
  finally {
    try { if (ownsFile && file?.exists) file.delete(); if (ownsFile && file?.exists) result.cleanupFailed = true }
    catch { result.cleanupFailed = true }
  }
  return result
}
