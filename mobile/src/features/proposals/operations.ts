import type { Proposal, AppliedEvent } from './api'

export type Outcome = {
  inflight: boolean
  phase: 'unknown' | 'known' | 'partial' | 'sent' | 'applied'
  id?: string
  proposal?: Proposal
  event?: AppliedEvent
}
// Process-lifetime ledger, deliberately outside keyed/disposable UI. No tokens,
// headers or cross-account storage; process/server idempotency is not claimed.
const outcomes = new Map<string, Outcome>()
const listeners = new Set<() => void>()
const key = (identity: string, kind: string, target: string) =>
  JSON.stringify([identity, kind, target])
const notify = () => listeners.forEach((listener) => listener())
export const proposalOperations = {
  get: (identity: string, kind: string, target: string) =>
    outcomes.get(key(identity, kind, target)),
  set: (identity: string, kind: string, target: string, outcome: Outcome) => {
    outcomes.set(key(identity, kind, target), outcome)
    notify()
  },
  clear: (identity: string, kind: string, target: string) => {
    outcomes.delete(key(identity, kind, target))
    notify()
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
