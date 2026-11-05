import test from 'node:test'
import assert from 'node:assert/strict'
import { getProposalStatus, isProposalExpired, summarizeProposalStatuses } from '../helpers/proposalStatus.mjs'

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
test('expiry is visible but preserves a recorded acceptance', () => {
  assert.equal(getProposalStatus({ ...published, validUntil: '2026-09-01' }, now), 'expired')
  assert.equal(getProposalStatus({ ...sent, validUntil: '2026-09-01' }, now), 'expired')
  assert.equal(getProposalStatus({ ...published, status: 'expired' }, now), 'expired')
  assert.equal(getProposalStatus({ ...sent, status: 'expired' }, now), 'expired')
  assert.equal(getProposalStatus({ ...published, validUntil: new Date(now).toISOString() }, now), 'expired')
  assert.equal(getProposalStatus({ ...sent, status: 'expired', selectedPackageId: 'main' }, now), 'accepted')
})

test('renewal detects expired dates even for accepted proposals, while drafts and revoked links stay excluded', () => {
  for (const status of ['published', 'expired']) {
    assert.equal(isProposalExpired({ status, validUntil: '2020-01-01', selectedPackageId: 'main' }, now), true)
  }
  for (const status of ['draft', 'revoked'])
    assert.equal(isProposalExpired({ status, validUntil: '2020-01-01' }, now), false)
  assert.equal(isProposalExpired({ status: 'published', validUntil: '2030-01-01' }, now), false)
  assert.equal(isProposalExpired({ status: 'published' }, now), false)
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
  const expired = { ...published, status: 'expired' }
  for (const proposals of [[expired, sent], [sent, expired]])
    assert.deepEqual(summarizeProposalStatuses(proposals, now), { 'event-a': 'sent' })
  assert.deepEqual(summarizeProposalStatuses([expired], now), { 'event-a': 'expired' })
})
