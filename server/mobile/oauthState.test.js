import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMobileOAuthState,
  hashMobileOAuthState,
  isMobileOAuthState,
  verifyMobileOAuthState,
} from './oauthState.js'

test('mobile OAuth state подписан, ограничен по времени и содержит session scope', () => {
  const now = 1_700_000_000_000
  const state = createMobileOAuthState({
    userId: 'user-a',
    tenantId: 'tenant-a',
    sessionId: 'session-a',
    appScheme: 'vedelo-dev',
    secret: 'test-secret',
    now,
    ttlMs: 60_000,
  })
  assert.equal(isMobileOAuthState(state), true)
  assert.match(hashMobileOAuthState(state), /^[a-f0-9]{64}$/)
  const payload = verifyMobileOAuthState(state, 'test-secret', now + 30_000)
  assert.equal(payload.userId, 'user-a')
  assert.equal(payload.tenantId, 'tenant-a')
  assert.equal(payload.sessionId, 'session-a')
  assert.equal(payload.appScheme, 'vedelo-dev')
  assert.equal(verifyMobileOAuthState(state, 'wrong-secret', now), null)
  assert.equal(verifyMobileOAuthState(`${state}broken`, 'test-secret', now), null)
  assert.equal(verifyMobileOAuthState(state, 'test-secret', now + 60_001), null)
})

test('mobile OAuth state не принимает произвольный redirect scheme', () => {
  const state = createMobileOAuthState({
    userId: 'user-a',
    tenantId: 'tenant-a',
    sessionId: 'session-a',
    appScheme: 'https',
    secret: 'test-secret',
  })
  assert.equal(verifyMobileOAuthState(state, 'test-secret')?.appScheme, 'vedelo')
})
