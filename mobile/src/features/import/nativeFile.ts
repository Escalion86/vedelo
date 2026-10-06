import * as DocumentPicker from 'expo-document-picker'
import { File, Paths } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
export const MAX_FILE_BYTES = 5 * 1024 * 1024
const mimes: Record<string, string> = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', txt: 'text/plain', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
export class InvalidImportFile extends Error { code = 'FILE_INVALID' }
export function validateFile(name: string, size: number) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (!mimes[ext]) throw new InvalidImportFile('Поддерживаются только XLSX, CSV, TXT и DOCX. Формат окончательно проверяет сервер.')
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_BYTES) throw new InvalidImportFile('Выберите непустой файл до 5 МБ. Размер должен быть известен.')
  return mimes[ext]
}
export type OwnedImportFile = { uri: string; name: string; type: string; size: number; cleanup: () => boolean }
export async function pickImportFile(onCleanupFailure: () => void): Promise<OwnedImportFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true })
  if (result.canceled) return null
  const asset = result.assets?.[0]
  if (!asset || result.assets.length !== 1) throw new InvalidImportFile('Выберите один файл.')
  const source = new File(asset.uri)
  const copy = new File(Paths.cache, `vedelo-import-${randomUUID()}`)
  // Only Expo's known app-cache picker directory is ours to clean. A provider's
  // content:// URI or arbitrary file path is borrowed and is never deleted.
  const cache = Paths.cache.uri.replace(/\/$/, '')
  const ownsPickerCopy = asset.uri.startsWith(`${cache}/DocumentPicker/`) && !asset.uri.includes('..') && !/%|[?#]/.test(asset.uri)
  const cleanupOne = (file: File) => { try { if (file.exists) file.delete(); return !file.exists } catch { return false } }
  try {
    const size = asset.size == null ? source.size : asset.size
    const type = validateFile(asset.name, size)
    validateFile(asset.name, source.size)
    source.copy(copy)
    validateFile(asset.name, copy.size)
    return { uri: copy.uri, name: asset.name, type, size, cleanup: () => { const ok = cleanupOne(copy); if (!ok) onCleanupFailure(); return ok } }
  } catch (reason) {
    if (!cleanupOne(copy)) onCleanupFailure()
    throw reason
  } finally {
    if (ownsPickerCopy && !cleanupOne(source)) onCleanupFailure()
  }
}
