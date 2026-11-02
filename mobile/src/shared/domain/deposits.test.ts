import { hasReceivedDeposit, isWaitingForDeposit } from './deposits'
import type { Transaction } from './types'
const payment: Transaction = { _id: 'p', eventId: 'e', type: 'income', category: 'deposit', amount: 50 }
it('obligations and negative/foreign payments cannot mark a deposit as received', () => {
  for (const patch of [{ paymentMethod: 'obligation' as const }, { amount: 0 }, { amount: -1 }, { eventId: 'foreign' }])
    expect(hasReceivedDeposit('e', [{ ...payment, ...patch }])).toBe(false)
  expect(hasReceivedDeposit('e', [payment])).toBe(true)
})
it('keeps a partially confirmed draft reachable and hides paid active/closed/canceled work', () => {
  const base = { _id: 'e', waitDeposit: true }
  expect(isWaitingForDeposit({ ...base, status: 'draft' }, [payment])).toBe(true)
  for (const status of ['active', 'closed', 'canceled'] as const) expect(isWaitingForDeposit({ ...base, status }, [payment])).toBe(false)
})
