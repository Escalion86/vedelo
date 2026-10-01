import type { Event } from '../../shared/domain/types'
import { getCachedEntity } from '../../shared/storage/cache'
import { saveLocalEntity } from '../../shared/storage/mutations'
import { performAttentionAction, postponeActions } from './actions'
import type { AttentionItem } from './selectors'

jest.mock('../../shared/storage/cache', () => ({ getCachedEntity: jest.fn() }))
jest.mock('../../shared/storage/mutations', () => ({ saveLocalEntity: jest.fn() }))
const now = new Date(2026, 9, 1, 12)
let event: Event
const item = (index = 0): AttentionItem => ({ key: String(index), event, index, task: { ...event.additionalEvents![index] }, kind: 'task' })
beforeEach(() => {
  jest.clearAllMocks()
  event = { _id: 'local-e', status: 'active', additionalEvents: [
    { _id: 't1', title: 'Позвонить', date: new Date(2026, 8, 30, 9, 45).toISOString() },
    { title: 'Без ID', description: 'Сохранить', date: null },
  ] }
  jest.mocked(getCachedEntity).mockImplementation(async () => event as never)
  jest.mocked(saveLocalEntity).mockImplementation(async ({ values }) => {
    event = { ...event, ...values }
    return event as never
  })
})

test('complete/undo идут через offline mutation, с partial payload и сохранением соседней задачи', async () => {
  await performAttentionAction(item(), { type: 'complete' }, now)
  expect(event.additionalEvents![0]).toMatchObject({ done: true, doneAt: now.toISOString() })
  expect(event.additionalEvents![1].description).toBe('Сохранить')
  expect(saveLocalEntity).toHaveBeenCalledWith({ entityType: 'events', entityId: 'local-e', values: { additionalEvents: event.additionalEvents } })
  await performAttentionAction(item(), { type: 'undo' }, now)
  expect(event.additionalEvents![0]).toMatchObject({ done: false, doneAt: null })
})
test('локальная задача без _id выполняется, редактируется и удаляется, не удаляя работу', async () => {
  await performAttentionAction(item(1), { type: 'complete' }, now)
  await performAttentionAction(item(1), { type: 'edit', title: ' Новый ', description: ' Текст ', date: null }, now)
  expect(event.additionalEvents![1]).toMatchObject({ title: 'Новый', description: 'Текст', date: null, done: true })
  await performAttentionAction(item(1), { type: 'delete' }, now)
  expect(event.additionalEvents).toHaveLength(1)
  expect(event.additionalEvents![0]._id).toBe('t1')
})
test.each(['overdue', 'today', 'tomorrow'] as const)('сегментный перенос %s сохраняет время', async (segment) => {
  const options = postponeActions(segment)
  expect(options.map((option) => option.days)).toEqual(segment === 'tomorrow' ? [2, 3] : [1, 2])
  for (const option of options) {
    await performAttentionAction(item(), { type: 'postpone', days: option.days }, now)
    expect(event.additionalEvents![0].date).toBe(new Date(2026, 9, 1 + option.days, 9, 45).toISOString())
  }
})
test('читает свежий cache, находит _id после сдвига массива', async () => {
  const target = item()
  event = { ...event, additionalEvents: [event.additionalEvents![1], { ...event.additionalEvents![0], description: 'Новый комментарий' }] }
  await performAttentionAction(target, { type: 'complete' }, now)
  expect(event.additionalEvents![1]).toMatchObject({ description: 'Новый комментарий', done: true })
  expect(event.additionalEvents![0].done).toBeUndefined()
})
test('отказывает при исчезнувшей работе и изменённой id-less задаче, без fallback POST', async () => {
  const target = item(1)
  event.additionalEvents!.unshift({ title: 'Другая' })
  await expect(performAttentionAction(target, { type: 'delete' }, now)).rejects.toThrow('Задача изменилась')
  jest.mocked(getCachedEntity).mockResolvedValue(null)
  await expect(performAttentionAction(item(), { type: 'complete' }, now)).rejects.toThrow('Работа недоступна')
  expect(saveLocalEntity).not.toHaveBeenCalled()
})
test('ошибка storage пробрасывается и последующий retry возможен', async () => {
  jest.mocked(saveLocalEntity).mockRejectedValueOnce(new Error('Нет доступа к хранилищу'))
  await expect(performAttentionAction(item(), { type: 'complete' }, now)).rejects.toThrow('Нет доступа')
  await performAttentionAction(item(), { type: 'complete' }, now)
  expect(event.additionalEvents![0].done).toBe(true)
})
test('соседние задачи одной работы не теряют изменения при одновременном нажатии', async () => {
  await Promise.all([performAttentionAction(item(), { type: 'complete' }, now), performAttentionAction(item(1), { type: 'complete' }, now)])
  expect(event.additionalEvents!.every((task) => task.done)).toBe(true)
})
