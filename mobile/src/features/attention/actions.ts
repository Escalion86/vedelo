import { applyTaskChangeToEvent, type TaskChange } from '../../shared/domain/taskActions'
import type { Event } from '../../shared/domain/types'
import { getCachedEntity } from '../../shared/storage/cache'
import { saveLocalEntity } from '../../shared/storage/mutations'
import type { AttentionItem, Segment } from './selectors'

export const postponeActions = (segment: Segment): Array<{ title: string; days: 1 | 2 | 3 }> =>
  segment === 'tomorrow'
    ? [{ title: 'На послезавтра', days: 2 }, { title: 'На +2 дня', days: 3 }]
    : [{ title: 'На завтра', days: 1 }, { title: 'На послезавтра', days: 2 }]

// Сериализация команд одной работы защищает соседние задачи от lost update.
const writes = new Map<string, Promise<void>>()
export function performAttentionAction(item: AttentionItem, change: TaskChange, now = new Date()) {
  const previous = writes.get(item.event._id) || Promise.resolve()
  const next = previous.catch(() => undefined).then(async () => {
    if (item.kind !== 'task') throw new Error('Задаток изменяется в карточке работы')
    const event = await getCachedEntity<Event>('events', item.event._id)
    if (!event || ['closed', 'canceled'].includes(event.status)) throw new Error('Работа недоступна. Обновите обзор.')
    const index = item.task._id
      ? (event.additionalEvents || []).findIndex((task) => task._id === item.task._id)
      : item.index
    // У локальных задач до первого sync может не быть _id. Не меняем другую
    // задачу, если массив успел сдвинуться после открытия редактора.
    if (!item.task._id && JSON.stringify(event.additionalEvents?.[index]) !== JSON.stringify(item.task)) {
      throw new Error('Задача изменилась. Обновите обзор и повторите действие.')
    }
    const updated = applyTaskChangeToEvent(event, index, change, now)
    if (!updated) throw new Error('Задача не найдена. Обновите обзор.')
    await saveLocalEntity({ entityType: 'events', entityId: event._id, values: { additionalEvents: updated.additionalEvents || [] } })
  })
  writes.set(item.event._id, next)
  void next.finally(() => { if (writes.get(item.event._id) === next) writes.delete(item.event._id) }).catch(() => undefined)
  return next
}
