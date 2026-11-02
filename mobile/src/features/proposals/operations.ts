import type { Proposal, AppliedEvent } from './api'
import { subscribeAuthSession } from '../../shared/auth/tokenStore'

export type Outcome = {
  inflight: boolean
  phase: 'unknown' | 'known' | 'partial' | 'sent' | 'applied'
  id?: string
  recoverable?: boolean
  cancelRequested?: boolean
  owner?: symbol
  proposal?: Proposal
  event?: AppliedEvent
}
// UI state outside keyed/disposable components. Creation attempts are also
// stored in SQLCipher by creationStore; send/apply keep their existing ledger.
const outcomes = new Map<string, Outcome>()
const listeners = new Set<() => void>()
const key = (identity: string, kind: string, target: string) =>
  JSON.stringify([identity, kind, target])
const notify = () => listeners.forEach((listener) => listener())
subscribeAuthSession(() => {
  for (const item of outcomes.keys()) if (String(JSON.parse(item)[1]).startsWith('create-')) outcomes.delete(item)
  notify()
})
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
