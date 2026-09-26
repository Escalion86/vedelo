import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getPaymentsWithoutReceipts,
  normalizeDocumentMetadata,
} from './documentWorkflow.js'
import {
  isProposalSelectionApplied,
  calculatePackageTotal,
  reconcileProposalServices,
} from './proposalWorkflow.js'
import { normalizeProposalPackages } from './proposalContent.js'

test('receipt is optional and independent; prompts only for real unlinked income', () => {
  const payments = [
    { _id: 'a', type: 'income', amount: 100, paymentMethod: 'cash' },
    { _id: 'b', type: 'income', amount: 200, paymentMethod: 'account' },
    { _id: 'c', type: 'expense', amount: 50 },
    { _id: 'd', type: 'income', amount: 50, paymentMethod: 'obligation' },
    { _id: 'e', type: 'income', amount: 50, paymentMethod: 'barter' },
  ]
  assert.deepEqual(
    getPaymentsWithoutReceipts(payments, [
      { type: 'receipt', transactionId: 'a' },
      { type: 'receipt' },
    ]).map((item) => item._id),
    ['b']
  )
  assert.equal(
    normalizeDocumentMetadata({
      type: 'invoice',
      transactionId: 'a'.repeat(24),
    }).transactionId,
    ''
  )
})

test('changed selection can be applied again, including changing away and back', () => {
  const proposal = {
    appliedAt: '2026-09-24',
    appliedPackageId: 'a',
    selectedPackageId: 'a',
    selectedAt: '2026-09-23',
    appliedSelectionAt: '2026-09-23',
  }
  assert.equal(isProposalSelectionApplied(proposal), true)
  assert.equal(
    isProposalSelectionApplied({ ...proposal, selectedPackageId: 'b' }),
    false
  )
  assert.equal(
    isProposalSelectionApplied({ ...proposal, selectedAt: '2026-09-25' }),
    false
  )
  assert.equal(
    isProposalSelectionApplied({
      appliedAt: '2026-09-24',
      selectedPackageId: 'a',
      selectedAt: '2026-09-23',
    }),
    true
  )
})

test('automatic totals follow lines, manual zero and discounts survive normalization', () => {
  const lines = [
    { title: 'Разовая работа', price: 12.34 },
    { title: 'Доставка', price: 5.67 },
  ]
  assert.equal(calculatePackageTotal(lines), 18.01)
  const make = (manualTotal, total) =>
    normalizeProposalPackages([
      { title: 'Вариант', lines, manualTotal, total },
    ])[0].total
  assert.equal(make(false, 999), 18.01)
  assert.equal(make(true, 10), 10)
  assert.equal(make(true, 0), 0)
})

test('service selection retains edits and custom lines, adds snapshots and removes deselected catalog lines', () => {
  const catalog = [
    { _id: 'a', title: 'A', description: 'Catalog A', price: 100 },
    { _id: 'b', title: 'B', description: 'Catalog B', price: 200 },
  ]
  const lines = [
    { serviceId: 'a', title: 'Edited', description: 'Custom terms', price: 80 },
    { serviceId: '', title: 'Custom', price: 10 },
    { serviceId: 'deleted', title: 'Archived', price: 30 },
  ]
  const selected = reconcileProposalServices(
    lines,
    ['a', 'b', 'b', 'foreign'],
    catalog
  )
  assert.equal(selected.length, 4)
  assert.deepEqual(selected[0], lines[0])
  assert.deepEqual(selected[3], {
    serviceId: 'b',
    title: 'B',
    description: 'Catalog B',
    price: 200,
  })
  assert.deepEqual(
    reconcileProposalServices(selected, ['b'], catalog).map(
      (line) => line.title
    ),
    ['Custom', 'Archived', 'B']
  )
  assert.equal(lines.length, 3)
})
