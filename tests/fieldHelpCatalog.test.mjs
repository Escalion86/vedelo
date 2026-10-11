import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const approved = JSON.parse(read('docs/field-help/APPROVED.json'))
const matrix = JSON.parse(read('docs/field-help/MATRIX.json'))
const texts = JSON.parse(read('helpers/fieldHelp.json'))

test('Согласованный источник сохранён побайтно: 91 новая запись и 3 обновления', () => {
  assert.equal(createHash('sha256').update(readFileSync(resolve(root, 'docs/field-help/APPROVED.json'))).digest('hex'), 'f13c42dc7a18aa5459e28bea41741e92f80a78c9d0615da8e17d38fdc6ec922c')
  assert.equal(approved.length, 94)
  assert.equal(approved.filter((entry) => entry.status === 'Добавить').length, 91)
  assert.equal(approved.filter((entry) => entry.status !== 'Добавить').length, 3)
})

test('94 смысловых ключа однозначно покрывают источник и сохраняют тексты', () => {
  assert.equal(Object.keys(matrix).length, 94)
  assert.deepEqual(Object.keys(texts), Object.keys(matrix))
  const covered = new Set()
  for (const [key, row] of Object.entries(matrix)) {
    assert.match(key, /^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$/)
    const matches = approved.filter((entry) => entry.source === row.source && entry.field === row.field)
    assert.equal(matches.length, 1, key)
    assert.equal(covered.has(matches[0]), false, key)
    covered.add(matches[0])
    assert.equal(texts[key], matches[0].text, key)
    assert.ok(texts[key].trim(), key)
  }
  assert.equal(covered.size, 94)
})

test('Матрица содержит обе веб-формы, честный Android-статус и существующие якоря', () => {
  for (const [key, row] of Object.entries(matrix)) {
    const web = row.webFieldEvidence
    const webCoverage = JSON.parse(read('docs/field-help/WEB-COVERAGE.json'))[key]
    assert.equal(webCoverage.status, 'implemented', key)
    assert.ok(webCoverage.host.length > 0, key)
    for (const host of webCoverage.host) {
      const source = read(host.path)
      assert.ok(source.includes(host.anchor), `${key}/webHost`)
      assert.ok(source.includes(`fieldHelp['${key}']`), `${key}/webHelp`)
    }
    assert.ok(read(web.path), `${key}/webFieldEvidence`)
    for (const variant of ['webClassic', 'webCompact']) {
      assert.ok(read(row[variant].path), `${key}/${variant}`)
      assert.ok(row[variant].placement, `${key}/${variant}`)
      if (row[variant].sharedControl) assert.ok(read(row[variant].sharedControl))
      if (row[variant].evidence) {
        const e = row[variant].evidence
        assert.ok(read(e.path).includes(e.anchor), `${key}/${variant}`)
      }
    }
    assert.ok(row.android.state, key)
    assert.ok(row.android.webTransition, key)
    // Матрица описывает исходный срез; help-пропы меняют буквальный JSX-якорь.
    // Для внедрённых полей проверяем актуальные host-якоря, не ослабляя проверку ключа.
    const coverage = JSON.parse(read('docs/field-help/ANDROID-COVERAGE.json'))[key]
    if (coverage.status === 'implemented') {
      assert.ok(coverage.host.length > 0, key)
      for (const host of coverage.host) {
        const source = read(host.path)
        assert.ok(source.includes(host.anchor), `${key}/host`)
        assert.ok(source.includes(`getFieldHelp('${key}')`), `${key}/help`)
      }
    } else {
      const e = row.android.evidence
      assert.ok(read(e.path).includes(e.anchor), key)
    }
    if (key.startsWith('admin.')) assert.match(row.android.state, /только веб/)
  }
})

test('Генерируемые JSON-копии равны и генератор не требует конфигурации окружения', () => {
  assert.equal(read('helpers/fieldHelp.json'), read('mobile/src/shared/domain/fieldHelp.generated.json'))
  const result = spawnSync(process.execPath, ['scripts/generateFieldHelp.mjs', '--check'], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
