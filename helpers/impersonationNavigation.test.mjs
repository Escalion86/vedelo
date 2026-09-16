import assert from 'node:assert/strict'
import test from 'node:test'
import {
  IMPERSONATION_DESTINATION,
  getImpersonationNavigationTarget,
} from './impersonationNavigation.mjs'

test('переключение остаётся на текущем origin PWA', () => {
  assert.equal(IMPERSONATION_DESTINATION, '/cabinet/eventsUpcoming')
  const target = getImpersonationNavigationTarget(
    'https://vedelo.ru/cabinet/eventsUpcoming'
  )
  assert.equal(target, IMPERSONATION_DESTINATION)
  assert.equal(target.startsWith('http'), false)
})
