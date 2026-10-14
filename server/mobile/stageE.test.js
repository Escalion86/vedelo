import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeMobileStatisticsPayload } from './statistics.js'
import { serializeMobileBilling } from './billing.js'

test('statistics DTO preserves public transferred flag and strips private fields', () => {
  const result = sanitizeMobileStatisticsPayload({ success: true, data: { events: [{ _id: 'e', isTransferred: true, tenantId: 'private', phone: 'private' }, { _id: 'legacy' } ] } })
  assert.equal(result.data.events[0].isTransferred, true)
  assert.equal(result.data.events[1].isTransferred, false)
  assert.equal('tenantId' in result.data.events[0], false)
  assert.equal('phone' in result.data.events[0], false)
})

test('billing DTO allowlists aggregated dynamic rates including zero (no file observations)', () => {
  const aiIncludedRates = { transcriptionRubPerSecond: 0.1, voiceNoteRub: 2, eventDraftRub: 4, fileRecordRub: 0, tenantId: 'private', provider: 'secret' }
  const result = serializeMobileBilling({ user: {}, currentTariff: null, tariffs: [], aiIncludedRates })
  assert.deepEqual(result.aiIncludedRates, { transcriptionRubPerSecond: 0.1, voiceNoteRub: 2, eventDraftRub: 4, fileRecordRub: 0 })
})

test('old billing callers remain compatible without rates', () => {
  const result = serializeMobileBilling({ user: {}, tariffs: [], currentTariff: null })
  assert.equal(result.currentTariff, null)
  assert.ok(!result.aiIncludedRates)
})

test('mobile AI helper is an exact local copy of the web formula', async () => {
  const { readFile } = await import('node:fs/promises')
  const original = await readFile(new URL('../../helpers/aiIncludedEstimate.mjs', import.meta.url), 'utf8')
  const mobile = await readFile(new URL('../../mobile/src/features/billing/aiIncludedEstimate.generated.ts', import.meta.url), 'utf8')
  assert.equal(mobile.split('\n').slice(2).join('\n'), original)
})
