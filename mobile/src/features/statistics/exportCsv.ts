import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
let sequence = 0
export async function shareStatisticsCsv(csv: string, current: () => boolean) {
  let file: File | null = null
  try {
    if (!await Sharing.isAvailableAsync()) throw new Error('SHARE_UNAVAILABLE')
    if (!current()) return
    file = new File(Paths.cache, `vedelo-statistics-${Date.now()}-${++sequence}.csv`)
    file.create({ overwrite: true, intermediates: true })
    file.write(csv)
    if (current()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Экспорт статистики Ведело' })
  } finally {
    // Cleanup failures must not replace a write/share failure or leave a UI lock.
    try { if (file?.exists) file.delete() } catch { /* Temporary cache file is retried by the OS cache lifecycle. */ }
  }
}
