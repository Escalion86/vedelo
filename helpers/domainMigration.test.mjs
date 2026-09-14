import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMigrationTargetUrl,
  getDomainMigrationPhase,
  isExternalApiPath,
  isPwaSystemPath,
} from './domainMigration.mjs'

const startedAt = '2026-09-01T00:00:00.000Z'
test('migration campaign has the three required stages', () => {
  assert.equal(getDomainMigrationPhase({ startedAt, now: '2026-09-01T12:00:00Z' }).phase, 'announcement')
  assert.equal(getDomainMigrationPhase({ startedAt, now: '2026-09-15T12:00:00Z' }).phase, 'countdown')
  assert.equal(getDomainMigrationPhase({ startedAt, now: '2026-09-30T12:00:00Z' }).phase, 'locked')
})

test('migration campaign stays inactive before the configured start', () => {
  assert.deepEqual(
    getDomainMigrationPhase({
      now: new Date('2026-09-30T23:59:59.999Z'),
      startedAt: '2026-10-01T00:00:00.000Z',
    }),
    { phase: 'inactive', day: 0, daysLeft: 30 }
  )
})

test('migration target keeps the secret outside request and referrer', () => {
  assert.equal(buildMigrationTargetUrl('one time'), 'https://vedelo.ru/migrate#code=one%20time')
})

test('system routes stay on the legacy origin and public webhooks move with method preservation', () => {
  assert.equal(isPwaSystemPath('/manifest.json'), true)
  assert.equal(isPwaSystemPath('/api/domain-migration/issue'), true)
  assert.equal(isPwaSystemPath('/api/domain-migration/status'), true)
  assert.equal(isPwaSystemPath('/api/push/unsubscribe'), true)
  assert.equal(isPwaSystemPath('/api/auth/session'), false)
  assert.equal(isPwaSystemPath('/api/push/test'), false)
  assert.equal(isExternalApiPath('/api/public/lead/tilda'), true)
  assert.equal(isExternalApiPath('/api/integrations/vk/webhook/token'), true)
})
