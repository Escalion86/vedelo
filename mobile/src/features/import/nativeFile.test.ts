import * as Picker from 'expo-document-picker'
import { MAX_FILE_BYTES, pickImportFile, validateFile } from './nativeFile'
const mockFiles = new Map<string, { size: number; failDelete?: boolean }>()
const mockDeletes: string[] = []
let mockUuid = 0
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockUuid}` }))
jest.mock('expo-file-system', () => ({ Paths: { cache: { uri: 'file:///cache' } }, File: class {
  uri: string
  constructor(base: string | { uri: string }, name?: string) { this.uri = name ? `${(base as any).uri}/${name}` : base as string }
  get exists() { return mockFiles.has(this.uri) }
  get size() { return mockFiles.get(this.uri)?.size || 0 }
  copy(destination: any) { if (!this.exists) throw new Error('read failed'); mockFiles.set(destination.uri, { ...mockFiles.get(this.uri)! }) }
  delete() { mockDeletes.push(this.uri); if (mockFiles.get(this.uri)?.failDelete) throw new Error('permission'); mockFiles.delete(this.uri) }
} }))
const select = (name = 'тест.csv', size: number | undefined = 12, uri = 'file:///cache/DocumentPicker/input.csv') => { mockFiles.set(uri, { size: size === undefined ? 17 : size }); (Picker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ name, size, uri, mimeType: 'untrusted' }] }) }
beforeEach(() => { jest.resetAllMocks(); mockFiles.clear(); mockDeletes.length = 0; mockUuid = 0 })
it.each(['xlsx', 'csv', 'TXT', 'docx'])('accept extension %s at maximum boundary', (ext) => expect(validateFile(`file.${ext}`, MAX_FILE_BYTES)).toMatch(/text|application/))
it.each(['pdf', 'xls', 'doc', 'xlsm', 'exe', 'csv.exe', ''])('unsupported %s даже с доверенным MIME', (ext) => expect(() => validateFile(`file.${ext}`, 10)).toThrow())
it.each([0, -1, NaN, Infinity, 1.5, MAX_FILE_BYTES + 1])('size %p rejected', (size) => expect(() => validateFile('file.csv', size)).toThrow())
it('cancel не ошибка; single/cache picker flags', async () => { (Picker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null }); expect(await pickImportFile(jest.fn())).toBeNull(); expect(Picker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ multiple: false, copyToCacheDirectory: true })); expect(mockDeletes).toHaveLength(0) })
it('unknown size берётся из настоящего File metadata', async () => { select(); mockFiles.get('file:///cache/DocumentPicker/input.csv')!.size = 17; (Picker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ name: 'тест.csv', uri: 'file:///cache/DocumentPicker/input.csv' }] }); const file = await pickImportFile(jest.fn()); expect(file?.size).toBe(17); expect(file?.type).toBe('text/csv'); expect(file?.uri).toContain('/vedelo-import-id-1'); expect(mockDeletes).toEqual(['file:///cache/DocumentPicker/input.csv']); expect(file?.cleanup()).toBe(true); expect(mockFiles.size).toBe(0) })
it('unknown zero/oversize rejected с cleanup', async () => { select(); (Picker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ name: 'x.csv', uri: 'file:///cache/DocumentPicker/input.csv' }] }); mockFiles.get('file:///cache/DocumentPicker/input.csv')!.size = 0; await expect(pickImportFile(jest.fn())).rejects.toThrow(); expect(mockFiles.size).toBe(0) })
it.each(['content://provider/private', 'file:///user/source.csv', 'file:///cache/DocumentPicker/../other', 'file:///cache/DocumentPicker/%2e%2e/private'])('не удаляет произвольный путь %s', async (uri) => { select('тест.csv', 12, uri); const file = await pickImportFile(jest.fn()); file?.cleanup(); expect(mockFiles.has(uri)).toBe(true); expect(mockDeletes).not.toContain(uri) })
it('отказ cleanup не выдаётся за удаление', async () => { select(); mockFiles.get('file:///cache/DocumentPicker/input.csv')!.failDelete = true; const warning = jest.fn(); const file = await pickImportFile(warning); expect(warning).toHaveBeenCalled(); expect(file?.cleanup()).toBe(false); expect(mockFiles.has(file!.uri)).toBe(true) })
it('unsupported копия очищается даже после ошибки', async () => { select('file.pdf'); await expect(pickImportFile(jest.fn())).rejects.toThrow(); expect(mockFiles.size).toBe(0) })
it('размер собственной копии ограничен даже при ложном picker size', async () => { select('x.csv', 12); mockFiles.get('file:///cache/DocumentPicker/input.csv')!.size = MAX_FILE_BYTES + 1; await expect(pickImportFile(jest.fn())).rejects.toThrow(); expect(mockFiles.size).toBe(0) })
