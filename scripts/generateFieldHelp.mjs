import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const approved = JSON.parse(readFileSync(resolve(root, 'docs/field-help/APPROVED.json'), 'utf8'))
const matrix = JSON.parse(readFileSync(resolve(root, 'docs/field-help/MATRIX.json'), 'utf8'))
const entries = Object.entries(matrix)
if (approved.length !== 94 || entries.length !== 94) {
  throw new Error('Каталог должен содержать ровно 94 согласованные записи')
}
const matched = new Set()
const texts = Object.fromEntries(entries.map(([key, target]) => {
  if (!/^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$/.test(key)) throw new Error(`Нестабильный ключ: ${key}`)
  const matches = approved.filter((entry) => entry.source === target.source && entry.field === target.field)
  if (matches.length !== 1 || matched.has(matches[0])) throw new Error(`Неоднозначная запись: ${key}`)
  matched.add(matches[0])
  return [key, matches[0].text]
}))
const content = `${JSON.stringify(texts, null, 2)}\n`
const targets = ['helpers/fieldHelp.json', 'mobile/src/shared/domain/fieldHelp.generated.json']
for (const target of targets) {
  const path = resolve(root, target)
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== content) throw new Error(`Каталог устарел: ${target}`)
  } else {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
}
console.log(`Каталог: ${matched.size} записей; обе копии ${process.argv.includes('--check') ? 'проверены' : 'сгенерированы'}`)
