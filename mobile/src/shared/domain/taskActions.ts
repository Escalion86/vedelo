import type { Event } from './types'

export type TaskAction = 'complete' | 'postpone_1' | 'postpone_3'

const getPostponedDate = (
  currentValue: string | null | undefined,
  days: number,
  now: Date
) => {
  const current = currentValue ? new Date(currentValue) : null
  const target = new Date(now)
  target.setDate(target.getDate() + days)
  if (current && !Number.isNaN(current.getTime())) {
    target.setHours(
      current.getHours(),
      current.getMinutes(),
      current.getSeconds(),
      current.getMilliseconds()
    )
  }
  return target.toISOString()
}

export const applyTaskActionToEvent = (
  event: Event,
  taskId: string,
  action: TaskAction,
  now = new Date()
) => {
  const taskIndex = (event.additionalEvents || []).findIndex(
    (task) => String(task._id || '') === taskId
  )
  if (taskIndex < 0) return null

  const additionalEvents = (event.additionalEvents || []).map((task, index) => {
    if (index !== taskIndex) return { ...task }
    if (action === 'complete') {
      return { ...task, done: true, doneAt: now.toISOString() }
    }
    return {
      ...task,
      done: false,
      doneAt: null,
      date: getPostponedDate(
        task.date,
        action === 'postpone_1' ? 1 : 3,
        now
      ),
    }
  })

  return { ...event, additionalEvents }
}

// UI-команды не расширяют контракт push API TaskAction.
export type TaskChange =
  | { type: 'complete' | 'undo' | 'delete' }
  | { type: 'postpone'; days: 1 | 2 | 3 }
  | { type: 'edit'; title: string; description: string; date: string | null }

export const applyTaskChangeToEvent = (event: Event, index: number, change: TaskChange, now: Date): Event | null => {
  const task = event.additionalEvents?.[index]
  if (!task) return null
  if (change.type === 'complete' && task._id) return applyTaskActionToEvent(event, task._id, 'complete', now)
  const additionalEvents = (event.additionalEvents || []).flatMap((item, position) => {
    if (position !== index) return [{ ...item }]
    if (change.type === 'delete') return []
    if (change.type === 'complete') return [{ ...item, done: true, doneAt: now.toISOString() }]
    if (change.type === 'undo') return [{ ...item, done: false, doneAt: null }]
    if (change.type === 'postpone') return [{ ...item, date: getPostponedDate(item.date, change.days, now) }]
    if (change.type === 'edit') return [{ ...item, title: change.title.trim(), description: change.description.trim(), date: change.date }]
    return [{ ...item }]
  })
  return { ...event, additionalEvents }
}
