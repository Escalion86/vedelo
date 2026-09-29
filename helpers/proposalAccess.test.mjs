import assert from 'node:assert/strict'
import test from 'node:test'
import { canUseProposalBuilder } from './proposalAccess.js'
import { getUserTariffAccess } from './tariffAccess.js'

test('proposal access depends on tariff, never on role', () => {
  for (const role of ['user', 'admin', 'dev']) {
    const user = { role, tariffId: 'plan', trialEndsAt: '2099-01-01' }
    assert.equal(canUseProposalBuilder(getUserTariffAccess(user, [{ _id: 'plan', allowProposals: true }])), true)
    assert.equal(canUseProposalBuilder(getUserTariffAccess(user, [{ _id: 'plan', allowProposals: false, allowDocuments: true }])), false)
    assert.equal(canUseProposalBuilder(getUserTariffAccess(user, [])), false)
  }
  assert.equal(canUseProposalBuilder(null), false)
})
test('legacy document tariffs retain proposal access', () => {
  assert.equal(canUseProposalBuilder(getUserTariffAccess({ tariffId: 'legacy' }, [{ _id: 'legacy', allowDocuments: true }])), true)
})
