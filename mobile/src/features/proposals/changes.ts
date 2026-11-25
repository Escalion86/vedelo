export const proposalOverviewQueryKey = 'native-proposal-overview'

const listeners = new Set<(identity: string) => void>()

export function subscribeProposalChanges(listener: (identity: string) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function notifyProposalChanges(identity: string) {
  for (const listener of listeners) listener(identity)
}
