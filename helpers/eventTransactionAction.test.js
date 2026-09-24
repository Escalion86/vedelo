import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventTransactionAction } from './eventTransactionAction.js'

test('returns autosave action when form is active but event id is still missing', () => {
  const result = getEventTransactionAction({
    clone: false,
    status: 'active',
    sourceEventId: null,
    isFormChanged: true,
  })

  assert.deepEqual(result, { type: 'autosave' })
})

test('returns autosave and promotion action for saved draft request', () => {
  const result = getEventTransactionAction({
    clone: false,
    status: 'draft',
    sourceEventId: 'evt-1',
    isFormChanged: true,
  })

  assert.deepEqual(result, { type: 'autosave', promoteDraft: true })
})

test('returns autosave and promotion action for new draft request', () => {
  const result = getEventTransactionAction({
    status: 'draft',
    sourceEventId: null,
  })

  assert.deepEqual(result, { type: 'autosave', promoteDraft: true })
})

test('returns open action for saved unchanged active event', () => {
  const result = getEventTransactionAction({
    clone: false,
    status: 'active',
    sourceEventId: 'evt-1',
    isFormChanged: false,
  })

  assert.deepEqual(result, {
    type: 'open',
    eventId: 'evt-1',
  })
})
