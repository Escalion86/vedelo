import type { Event, Transaction } from './types'

// Keep in step with helpers/additionalEvents.js, including recovery of a draft
// whose payment succeeded before confirmation was interrupted.
export const hasReceivedDeposit = (eventId: string, transactions: Transaction[]) => transactions.some(item =>
  item.eventId === eventId && item.type === 'income' && item.paymentMethod !== 'obligation' &&
  ['deposit', 'advance'].includes(item.category || '') && item.amount > 0)

export const isWaitingForDeposit = (event: Event, transactions: Transaction[]) => Boolean(event.waitDeposit) &&
  ['draft', 'active'].includes(event.status) && (event.status === 'draft' || !hasReceivedDeposit(event._id, transactions))
