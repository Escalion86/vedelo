import test from 'node:test'
import assert from 'node:assert/strict'
import { getProposalStatus, summarizeProposalStatuses } from '../helpers/proposalStatus.mjs'

const now = Date.parse('2026-09-28')
const sent = { eventId: 'event-a', status: 'published', sentAt: '2026-09-27' }
const published = { eventId: 'event-a', status: 'published' }
test('a published link, confirmed delivery and client selection each create a status', () => {
  assert.equal(getProposalStatus(published, now), 'published')
  assert.equal(getProposalStatus(sent, now), 'sent')
  assert.equal(getProposalStatus({ ...sent, selectedPackageId: 'main' }, now), 'accepted')
  for (const status of ['draft', 'revoked']) {
    assert.equal(getProposalStatus({ ...sent, status, selectedPackageId: 'main' }, now), null)
  }
})
test('expiry hides published and sent status but preserves a recorded acceptance', () => {
  assert.equal(getProposalStatus({ ...published, validUntil: '2026-09-01' }, now), null)
  assert.equal(getProposalStatus({ ...sent, validUntil: '2026-09-01' }, now), null)
  assert.equal(getProposalStatus({ ...published, status: 'expired' }, now), null)
  assert.equal(getProposalStatus({ ...sent, status: 'expired' }, now), null)
  assert.equal(getProposalStatus({ ...sent, status: 'expired', selectedPackageId: 'main' }, now), 'accepted')
})
test('accepted proposal takes priority across versions in either order', () => {
  const accepted = { ...sent, selectedPackageId: 'main' }
  for (const proposals of [[sent, accepted], [accepted, sent]]) {
    assert.deepEqual(summarizeProposalStatuses(proposals, now), { 'event-a': 'accepted' })
  }
  for (const proposals of [[published, sent], [sent, published]]) {
    assert.deepEqual(summarizeProposalStatuses(proposals, now), { 'event-a': 'sent' })
  }
  assert.deepEqual(summarizeProposalStatuses([published], now), { 'event-a': 'published' })
  assert.deepEqual(summarizeProposalStatuses([sent, { ...sent, eventId: 'event-b' }], now), { 'event-a': 'sent', 'event-b': 'sent' })
  assert.deepEqual(summarizeProposalStatuses([], now), {})
})
