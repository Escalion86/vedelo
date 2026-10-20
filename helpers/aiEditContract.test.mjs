import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAiEditSteps, validateAiEditPatch } from './aiEditContract.mjs'

const snapshot = {
  event: { _id: 'e', status: 'active', clientId: 'c', eventDate: '2026-10-24T10:00:00.000Z',
    address: { town: 'Красноярск', street: 'Мира' },
    additionalEvents: [{ _id: 'task', title: 'Позвонить', date: '2026-10-22T10:00:00.000Z', done: false }] },
  client: { _id: 'c', phone: 79000000000 }, transactions: [], services: [{ _id: 's' }],
}
const build = (actions, data = snapshot) => buildAiEditSteps({ actions }, data, () => 'new')
test('partial event address and task edit preserve unrelated values', () => {
  const result = build([
    { entity: 'event', operation: 'update', id: 'e', patch: { address: { house: '10' } } },
    { entity: 'task', operation: 'update', id: 'task', patch: { done: true } },
  ])
  assert.equal(result.steps.length, 1)
  assert.deepEqual(result.steps[0].patch.address, { town: 'Красноярск', street: 'Мира', house: '10' })
  assert.equal(result.steps[0].patch.additionalEvents[0].title, 'Позвонить')
  assert.equal(result.steps[0].patch.additionalEvents[0].done, true)
  assert.ok(result.steps[0].patch.additionalEvents[0].doneAt)
  assert.equal(snapshot.event.additionalEvents[0].done, false)
})
test('foreign entity and task IDs cannot be used', () => {
  for (const entity of ['event', 'client', 'transaction', 'task'])
    assert.throws(() => build([{ entity, operation: 'update', id: 'foreign', patch: {} }]), /не найдена/)
})
test('reject unknown fields, Mongo operators, status and deletion', () => {
  for (const patch of [{ tenantId: 'foreign' }, { $set: {} }, { status: 'closed' }, { additionalEvents: [] }])
    assert.throws(() => validateAiEditPatch('event', patch))
  assert.throws(() => build([{ entity: 'client', operation: 'delete', id: 'c', patch: {} }]))
})
const payment = { entity: 'transaction', operation: 'create', patch: {
  amount: 10000, type: 'income', category: 'deposit', date: '2026-10-20T10:00:00Z', paymentMethod: 'cash',
} }
test('complete payment and client update produce separate steps', () => {
  const result = build([payment, { entity: 'client', operation: 'update', id: 'c', patch: { phone: '+7 (999) 123-45-67' } }])
  assert.equal(result.steps[0].id, 'new')
  assert.equal(result.steps[1].patch.phone, 79991234567)
})
test('draft, incomplete and duplicate payments are rejected', () => {
  assert.throws(() => build([payment], { ...snapshot, event: { ...snapshot.event, status: 'draft' } }), /заявки/)
  assert.throws(() => build([{ ...payment, patch: { amount: 10000 } }]), /Уточните/)
  assert.throws(() => build([payment], { ...snapshot, transactions: [{ ...payment.patch, _id: 't' }] }), /похожая оплата/)
})
test('invalid values and unknown services fail closed', () => {
  for (const patch of [{ contractSum: -1 }, { contractSum: Infinity }, { waitDeposit: 'false' },
    { eventDate: '2026-10-20' }, { servicesIds: ['foreign'] }, { address: { $set: {} } }])
    assert.throws(() => validateAiEditPatch('event', patch, ['s']))
  assert.deepEqual(validateAiEditPatch('event', { contractSum: 0, waitDeposit: false }), { contractSum: 0, waitDeposit: false })
})
test('questions never produce writes, even if actions accompany them', () => {
  assert.deepEqual(buildAiEditSteps({ question: 'Какая оплата?', actions: [payment] }, snapshot), { question: 'Какая оплата?', steps: [] })
})
test('closed orders, repeated targets and invalid duration are rejected', () => {
  assert.throws(() => build([], { ...snapshot, event: { ...snapshot.event, status: 'closed' } }))
  const action = { entity: 'event', id: 'e', operation: 'update', patch: { contractSum: 5 } }
  assert.throws(() => build([action, action]), /несколько раз/)
  assert.throws(() => build([{ ...action, patch: { dateEnd: '2026-10-20T10:00:00Z' } }]), /Начало/)
})
