import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Подсказка отзывов тарифа не вложена в кнопку', () => {
  const source = readFileSync('layouts/modals/modalsFunc/tariffFunc.js', 'utf8')
  assert.doesNotMatch(source, /<button[\s\S]*?<IconCheckBox[^>]*help=\{fieldHelp\['admin.tariffReviews'\]\}/)
})
const matrix = JSON.parse(readFileSync('docs/field-help/MATRIX.json', 'utf8'))
for (const [key, entry] of Object.entries(matrix)) {
  test(`Веб-подсказка подключена: ${key}`, () => {
    const source = readFileSync(entry.webFieldEvidence.path, 'utf8')
    assert.ok(source.includes(`fieldHelp['${key}']`), `Нет привязки ${key} в ${entry.webFieldEvidence.path}`)
  })
}
test('Компактная форма использует видимые подписи независимых полей и разделов', () => {
  const source = readFileSync('components/CompactEventForm.js', 'utf8')
  for (const key of ['event.client', 'event.services', 'event.dates', 'event.tasks', 'documents.event', 'proposal.section', 'event.status']) {
    assert.ok(source.includes(`fieldHelp['${key}']`), key)
  }
})
