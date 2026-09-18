import test from 'node:test'
import assert from 'node:assert/strict'
import formatPersonName from './formatPersonName.js'

test('capitalizes every part of a full name stored in one field', () => {
  assert.equal(
    formatPersonName('Белинский Алексей Алексеевич'),
    'Белинский Алексей Алексеевич'
  )
})

test('normalizes letter case in compound names', () => {
  assert.equal(
    formatPersonName('ИВАНОВА-ПЕТРОВА анна-мария'),
    'Иванова-Петрова Анна-Мария'
  )
})
