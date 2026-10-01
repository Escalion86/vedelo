import type { Event } from '../../shared/domain/types'

export const bottomSlots = ['attention', 'events', 'create', 'clients', 'menu'] as const
export type BottomSlot = typeof bottomSlots[number]

// Match the PWA navigation badge: unfinished contacts strictly before now.
export const countOverdueTasks = (events: readonly Event[], now = new Date()) => {
  return events.reduce((count, event) => count + (event.additionalEvents || [])
    .filter((task) => !task.done && task.date && new Date(task.date).getTime() < now.getTime()).length, 0)
}
