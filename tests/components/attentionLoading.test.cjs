const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')

test('«Важное» не показывает пустой обзор до завершения первичной загрузки', () => {
  const source = readFileSync(
    path.resolve('layouts/modals/modalsFunc/upcomingEventsOverviewFunc.js'),
    'utf8'
  )

  assert.match(source, /isPending: isEventsPending/)
  assert.match(source, /isPending: isTransactionsPending/)
  assert.match(source, /isPending: isClientsPending/)
  assert.match(source, /pastClosableCount === null/)
  assert.match(
    source,
    /if \(isOverviewPending\) \{[\s\S]*role="status"[\s\S]*Проверяем важные дела…/
  )
})
