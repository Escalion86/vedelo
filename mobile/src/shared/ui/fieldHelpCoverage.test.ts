import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '../../..')
const matrix = JSON.parse(fs.readFileSync(path.join(root, '../docs/field-help/MATRIX.json'), 'utf8'))
const applicable = Object.entries(matrix).filter(([, entry]: any) => !entry.android.state.startsWith('нет:') && !entry.android.state.startsWith('только веб:'))
it.each(applicable)('%s: справка подключена в существующем native UI', (key, value: any) => {
  const source = fs.readFileSync(path.join(root, '..', value.android.evidence.path), 'utf8')
  expect(source).toContain(`getFieldHelp('${key}')`)
})

const coverage = JSON.parse(fs.readFileSync(path.join(root, '../docs/field-help/ANDROID-COVERAGE.json'), 'utf8'))
it('в coverage отражены все утверждённые ключи без пропусков', () => {
  expect(Object.keys(coverage).sort()).toEqual(Object.keys(matrix).sort())
})
it.each(Object.entries(coverage))('%s: статус coverage подтверждён источником и якорем', (key, row: any) => {
  const applicableKey = applicable.some(([candidate]) => candidate === key)
  expect(row.status).toBe(applicableKey ? 'implemented' : matrix[key].android.state.startsWith('только веб:') ? 'web-only' : 'unavailable')
  expect(row.evidence.path).toBeTruthy()
  expect(fs.existsSync(path.join(root, '..', row.evidence.path))).toBe(true)
  expect(row.webTransition).toBeTruthy()
  if (applicableKey) {
    expect(row.host.length).toBeGreaterThan(0)
    for (const host of row.host) {
      const source = fs.readFileSync(path.join(root, '..', host.path), 'utf8')
      expect(source).toContain(host.anchor)
      expect(source).toContain(`getFieldHelp('${key}')`)
    }
  }
})
it.each(['notifications.device', 'settings.timeZone', 'statistics.includeRequests', 'documents.event'])('%s: платформенная адаптация перечислена явно', (key) => {
  expect(coverage[key].status).toBe('implemented')
  expect(coverage[key].adaptation).toBeTruthy()
})
