import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createEventListFiltersState,
  getEventListFiltersStorageKey,
  getStatusFilterDefaults,
  getStatusFilterKeys,
  readEventListFiltersState,
  serializeEventListFiltersState,
} from './eventListFilters.js'

test('keeps transferred events in a separate optional filter', () => {
  assert.equal(createEventListFiltersState('upcoming').transferredMode, 'all')
  assert.equal(createEventListFiltersState('past').transferredMode, 'all')
  assert.equal('transferred' in getStatusFilterDefaults('upcoming'), false)
  assert.equal('transferred' in getStatusFilterDefaults('past'), false)
  assert.equal(getStatusFilterKeys('upcoming').includes('transferred'), false)
  assert.equal(getStatusFilterKeys('past').includes('transferred'), false)
})

test('restores persisted event list filters for the current page mode', () => {
  const storage = new Map()
  const key = getEventListFiltersStorageKey('past')
  storage.set(
    key,
    serializeEventListFiltersState('past', {
      selectedTown: 'Красноярск',
      checkFilter: { checked: false, unchecked: true },
      statusFilter: {
        request: true,
        finished: false,
        closed: true,
        canceled: true,
      },
      transferredMode: 'only',
    })
  )

  assert.deepEqual(
    readEventListFiltersState('past', {
      getItem: (name) => storage.get(name) ?? null,
    }),
    {
      selectedTown: 'Красноярск',
      checkFilter: { checked: false, unchecked: true },
      statusFilter: {
        request: true,
        finished: false,
        closed: true,
        canceled: true,
      },
      transferredMode: 'only',
    }
  )
})

test('falls back to defaults when persisted event filters are invalid', () => {
  const storage = {
    getItem: () =>
      JSON.stringify({
        version: 2,
        selectedTown: 100,
        checkFilter: { checked: false, unchecked: false },
        statusFilter: {
          request: false,
          finished: false,
          closed: false,
          canceled: false,
        },
        transferredMode: 'invalid',
      }),
  }

  assert.deepEqual(readEventListFiltersState('past', storage), {
    selectedTown: '',
    checkFilter: { checked: true, unchecked: true },
    statusFilter: getStatusFilterDefaults('past'),
    transferredMode: 'all',
  })
})

test('creates default event list filters when storage is unavailable', () => {
  assert.deepEqual(createEventListFiltersState('upcoming'), {
    selectedTown: '',
    checkFilter: { checked: true, unchecked: true },
    statusFilter: getStatusFilterDefaults('upcoming'),
    transferredMode: 'all',
  })
})
