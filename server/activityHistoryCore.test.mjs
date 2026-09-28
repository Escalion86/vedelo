import assert from 'node:assert/strict'
import test from 'node:test'
import { buildHistoryChanges, getHistoryEntityLabel, getTaskSemanticAction } from './activityHistoryCore.mjs'

test('history diff includes allowed fields and excludes secrets and technical fields', () => {
  const changes = buildHistoryChanges({
    entityType: 'client',
    operation: 'update',
    before: { firstName: 'Анна', password: 'old', syncVersion: 1 },
    after: { firstName: 'Мария', password: 'new', syncVersion: 2 },
  })
  assert.deepEqual(changes, [{ field: 'firstName', label: 'Имя', oldValue: 'Анна', newValue: 'Мария' }])
})

test('history recognizes completed task', () => {
  const changes = buildHistoryChanges({
    entityType: 'event', operation: 'update',
    before: { additionalEvents: [{ title: 'Позвонить', done: false, googleCalendarEventId: 'old-private-id' }] },
    after: { additionalEvents: [{ title: 'Позвонить', done: true, googleCalendarEventId: 'new-private-id' }] },
  })
  assert.equal(getTaskSemanticAction(changes), 'task_completed')
  assert.equal(JSON.stringify(changes).includes('private-id'), false)
})

test('entity labels are human readable', () => {
  assert.equal(getHistoryEntityLabel('client', { firstName: 'Анна', secondName: 'Иванова' }), 'Анна Иванова')
  assert.equal(getHistoryEntityLabel('event', { status: 'draft', eventType: 'Свадьба' }), 'Заявка: Свадьба')
})

test('creating or deleting an event is not a task action, even with tasks', () => {
  for (const additionalEvents of [[], [{ title: 'Позвонить', done: false }]]) {
    for (const operation of ['create', 'delete']) {
      const changes = buildHistoryChanges({
        entityType: 'event', operation,
        before: operation === 'delete' ? { additionalEvents } : null,
        after: operation === 'create' ? { additionalEvents } : null,
      })
      assert.equal(getTaskSemanticAction(changes, operation), '')
    }
  }
})

test('normalizing an empty task list is not a task update', () => {
  const changes = buildHistoryChanges({
    entityType: 'event', operation: 'update',
    before: {}, after: { additionalEvents: [] },
  })
  assert.equal(getTaskSemanticAction(changes, 'update'), '')
})
