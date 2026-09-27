import test from 'node:test'
import assert from 'node:assert/strict'
import { sortUsers, USER_SORT_MODES } from './usersSort.js'

const getIds = (users) => users.map((user) => user._id)

test('activity sorts mutations newest first, unknown last, ignores visits and does not mutate', () => {
  const users = [
    { _id: 'unknown', lastActivityAt: '2027-01-01', secondName: 'Б' },
    { _id: 'old', lastMutationAt: '2026-01-01' },
    { _id: 'invalid', lastMutationAt: 'invalid', secondName: 'А' },
    { _id: 'new', lastMutationAt: '2026-09-27' },
  ]
  assert.deepEqual(getIds(sortUsers(users, USER_SORT_MODES.ACTIVITY)), [
    'new',
    'old',
    'invalid',
    'unknown',
  ])
  assert.deepEqual(getIds(users), ['unknown', 'old', 'invalid', 'new'])
})

test('sortUsers keeps name sorting as default', () => {
  const users = [
    { _id: '3', secondName: 'Петров', firstName: 'Борис' },
    { _id: '1', secondName: 'Иванов', firstName: 'Анна' },
    { _id: '2', secondName: 'Иванов', firstName: 'Алексей' },
  ]

  assert.deepEqual(getIds(sortUsers(users)), ['2', '1', '3'])
})

test('sortUsers sorts by registration date, balance and created items', () => {
  const users = [
    {
      _id: 'old-rich',
      createdAt: '2026-01-01T00:00:00.000Z',
      balance: 5000,
      eventsCount: 1,
      requestsCount: 1,
    },
    {
      _id: 'new-low',
      createdAt: '2026-03-01T00:00:00.000Z',
      balance: 1000,
      eventsCount: 4,
      requestsCount: 3,
    },
    {
      _id: 'middle-active',
      createdAt: '2026-02-01T00:00:00.000Z',
      balance: 3000,
      eventsCount: 5,
      requestsCount: 5,
    },
  ]

  assert.deepEqual(getIds(sortUsers(users, USER_SORT_MODES.REGISTRATION)), [
    'new-low',
    'middle-active',
    'old-rich',
  ])
  assert.deepEqual(getIds(sortUsers(users, USER_SORT_MODES.BALANCE)), [
    'old-rich',
    'middle-active',
    'new-low',
  ])
  assert.deepEqual(getIds(sortUsers(users, USER_SORT_MODES.CREATED_ITEMS)), [
    'middle-active',
    'new-low',
    'old-rich',
  ])
})
