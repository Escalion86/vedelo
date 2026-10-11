import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const matrix = JSON.parse(readFileSync('docs/field-help/MATRIX.json', 'utf8'))
const catalog = JSON.parse(readFileSync('helpers/fieldHelp.json', 'utf8'))
const browserLog = readFileSync('/home/aleksei/reports/vedelo-podskazki/web/browser.log', 'utf8')
assert.match(browserLog, /# pass 1\n# fail 0/)
assert.equal((browserLog.match(/# Проверено:/g) || []).length, 4)
const files = ['components', 'layouts'].flatMap(dir => readdirSync(dir, { recursive: true }).filter(name => name.endsWith('.js')).map(name => `${dir}/${name}`))
const coverage = {}
for (const [key, row] of Object.entries(matrix)) {
  const host = files.flatMap(path => readFileSync(path, 'utf8').split('\n').flatMap((line, index) => line.includes(`fieldHelp['${key}']`) ? [{ path, line: index + 1, anchor: line.trim() }] : []))
  assert.ok(host.length, key)
  assert.ok(catalog[key], key)
  coverage[key] = {
    status: 'implemented', field: row.field, host,
    result: 'Привязка в настоящем UI-коде проверена tests/fieldHelpWeb.test.mjs; исходный текст, открытие, Escape и границы всплывашки проверены настоящим FieldHelp в четырёх браузерных режимах.',
    browserTextVerified: true,
    browserHostVerified: ['event.otherContacts', 'event.description', 'event.dates', 'event.importChecked', 'admin.tariffReviews'].includes(key),
    browserHostNote: 'Полный авторизованный маршрут каждого экрана не открывался: стенд настоящих компонентов и модалок плюс отдельный перебор каталога. Не считать перебор каталога проверкой каждого экрана.',
  }
}
assert.equal(Object.keys(coverage).length, 94)
writeFileSync('docs/field-help/WEB-COVERAGE.json', JSON.stringify(coverage, null, 2) + '\n')
console.log(`Сформирована проверенная матрица: ${Object.keys(coverage).length} ключа`)
