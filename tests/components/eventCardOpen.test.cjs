const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')

test('event card view receives site settings from modal generator options', () => {
  const source = readFileSync(
    path.resolve('layouts/modals/modalsFuncGenerator.js'),
    'utf8'
  )

  assert.match(source, /view: \(eventId, viewOptions\) =>/)
  assert.match(source, /siteSettings: options\?\.siteSettings/)
  assert.doesNotMatch(source, /\.\.\.options, siteSettings/)
})
