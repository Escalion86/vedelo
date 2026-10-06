import { shareEncryptedFile, downloadAndShareTemplate } from './nativeFiles'
const mockDecrypt = jest.fn()
const mockCleanup = jest.fn()
const mockShare = jest.fn()
const mockDownload = jest.fn()
const mockDelete = jest.fn()
const mockCreate = jest.fn()
const mockWrite = jest.fn()
jest.mock('expo-sharing', () => ({ shareAsync: (...args: any[]) => mockShare(...args) }))
jest.mock('expo-file-system', () => ({ Paths: { cache: 'cache' }, File: jest.fn().mockImplementation(() => ({ uri: 'cache://template', exists: true, create: mockCreate, write: mockWrite, delete: mockDelete })) }))
jest.mock('../../shared/api/client', () => ({ api: { download: (...args: any[]) => mockDownload(...args) } }))
jest.mock('../../shared/storage/encryptedFiles', () => ({ decryptToTemporaryFile: (...args: any[]) => mockDecrypt(...args), deleteTemporaryDecryptedFile: (...args: any[]) => mockCleanup(...args) }))
const file = { id: 'f', localUri: 'encrypted', name: 'Длинное имя.pdf', mimeType: 'application/pdf', size: 20, status: 'synced' }
const template = { id: 't', name: 'Шаблон', fileName: 'Очень длинный шаблон.docx', type: 'contract' as const }
beforeEach(() => { jest.clearAllMocks(); mockDecrypt.mockResolvedValue('cache://plaintext'); mockCleanup.mockResolvedValue(undefined); mockShare.mockResolvedValue(undefined); mockDownload.mockResolvedValue(new ArrayBuffer(3)); mockDelete.mockImplementation(() => undefined) })
it('X: успешный native share расшифрованной копии очищается в finally', async () => {
  await shareEncryptedFile(file)
  expect(mockShare).toHaveBeenCalledWith('cache://plaintext', { mimeType: file.mimeType, dialogTitle: file.name })
  expect(mockCleanup).toHaveBeenCalledWith('cache://plaintext')
})
it('X: ошибка share + cleanup сохраняет исходную ошибку', async () => {
  mockShare.mockRejectedValueOnce(new Error('share failure')); mockCleanup.mockRejectedValueOnce(new Error('cleanup failure'))
  await expect(shareEncryptedFile(file)).rejects.toThrow('share failure')
  expect(mockCleanup).toHaveBeenCalledTimes(1)
})
it('X: уход с route после decrypt отменяет share, но очищает файл', async () => {
  await shareEncryptedFile(file, () => false)
  expect(mockShare).not.toHaveBeenCalled(); expect(mockCleanup).toHaveBeenCalledTimes(1)
})
it('X: ошибка decrypt не передаёт отсутствующий файл в share', async () => {
  mockDecrypt.mockRejectedValueOnce(new Error('decrypt failure'))
  await expect(shareEncryptedFile(file)).rejects.toThrow('decrypt failure')
  expect(mockShare).not.toHaveBeenCalled()
})
it('X: download bearer шаблона сохраняет временный файл и удаляет после share', async () => {
  await downloadAndShareTemplate(template)
  expect(mockDownload).toHaveBeenCalledWith('/mobile/v1/document-templates/t')
  expect(mockWrite).toHaveBeenCalledWith(new Uint8Array(3)); expect(mockDelete).toHaveBeenCalledTimes(1)
})
it('X: downloaded cleanup не скрывает ошибку share; поздний download не пишет файл', async () => {
  mockShare.mockRejectedValueOnce(new Error('share failure')); mockDelete.mockImplementationOnce(() => { throw new Error('cleanup failure') })
  await expect(downloadAndShareTemplate(template)).rejects.toThrow('share failure')
  jest.clearAllMocks()
  await downloadAndShareTemplate(template, () => false)
  expect(mockCreate).not.toHaveBeenCalled(); expect(mockShare).not.toHaveBeenCalled()
})
it('X: ошибка записи скачанного файла тоже запускает cleanup', async () => {
  mockWrite.mockImplementationOnce(() => { throw new Error('write failure') })
  await expect(downloadAndShareTemplate(template)).rejects.toThrow('write failure')
  expect(mockDelete).toHaveBeenCalledTimes(1); expect(mockShare).not.toHaveBeenCalled()
})
