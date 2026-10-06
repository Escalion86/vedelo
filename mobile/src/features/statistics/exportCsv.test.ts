import { shareStatisticsCsv } from './exportCsv'
import * as Sharing from 'expo-sharing'
const mockCreate = jest.fn(); const mockWrite = jest.fn(); const mockDelete = jest.fn(); const mockFile = jest.fn()
jest.mock('expo-file-system', () => ({ Paths: { cache: 'cache' }, File: class { uri = 'cache/file.csv'; exists = true; constructor(...args: any[]) { mockFile(...args) } create = mockCreate; write = mockWrite; delete = mockDelete } }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }))
beforeEach(() => { jest.resetAllMocks(); (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true); (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined) })
test('успех/отмена native share очищает файл', async () => {
  await shareStatisticsCsv('\ufeffданные', () => true)
  expect(mockWrite).toHaveBeenCalledWith('\ufeffданные'); expect(Sharing.shareAsync).toHaveBeenCalledTimes(1); expect(mockDelete).toHaveBeenCalledTimes(1)
})
test.each(['create', 'write', 'share'])('ошибка %s тоже очищает файл', async (at) => {
  const error = new Error('failed')
  if (at === 'create') mockCreate.mockImplementation(() => { throw error })
  if (at === 'write') mockWrite.mockImplementation(() => { throw error })
  if (at === 'share') (Sharing.shareAsync as jest.Mock).mockRejectedValue(error)
  await expect(shareStatisticsCsv('csv', () => true)).rejects.toBe(error)
  expect(mockDelete).toHaveBeenCalledTimes(1)
})
test('cleanup не заменяет ошибку share', async () => {
  const reason = new Error('share'); (Sharing.shareAsync as jest.Mock).mockRejectedValue(reason); mockDelete.mockImplementation(() => { throw new Error('cleanup') })
  await expect(shareStatisticsCsv('csv', () => true)).rejects.toBe(reason)
})
test('недоступный share или устаревшая операция не пишет файл', async () => {
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false)
  await expect(shareStatisticsCsv('csv', () => true)).rejects.toThrow()
  ;(Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true)
  await shareStatisticsCsv('csv', () => false)
  expect(mockCreate).not.toHaveBeenCalled(); expect(Sharing.shareAsync).not.toHaveBeenCalled()
})
test('уникальные имена исключают удаление файла другой операции', async () => {
  await shareStatisticsCsv('first', () => true); await shareStatisticsCsv('second', () => true)
  expect(mockFile.mock.calls[0][1]).not.toBe(mockFile.mock.calls[1][1])
})
