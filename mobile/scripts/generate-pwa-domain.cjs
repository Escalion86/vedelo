const { readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const normalized = (text) => text.replace(/\r\n/g, '\n').trimEnd()
for (const [source, path] of [
  ['helpers/phoneNumbersFromText.mjs', 'shared/format/phoneNumbersFromText.generated.ts'],
  ['helpers/getStatisticsMonthDetails.js', 'features/statistics/monthDetails.generated.ts'],
]) {
  const target = resolve(__dirname, '../src', path)
  const output = `// @ts-nocheck\n// Generated from ${source} by generate-pwa-domain.cjs.\n` + normalized(readFileSync(resolve(__dirname, '../..', source), 'utf8')) + '\n'
  if (process.argv.includes('--check')) {
    if (normalized(readFileSync(target, 'utf8')) !== normalized(output)) throw Error(`${path} is out of date`)
  } else writeFileSync(target, output)
}
