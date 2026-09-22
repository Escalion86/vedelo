const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')

test('карточки новостей имеют адаптивный отступ от краёв списка', () => {
  const source = readFileSync(
    path.resolve('layouts/content/SiteNewsContent.js'),
    'utf8'
  )

  assert.match(
    source,
    /SectionCard className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-4"/
  )
})
